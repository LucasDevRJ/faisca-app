import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cycleSummaryText } from '../features/cycle/cycle-format';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { renderRoute } from '../test/render';
import { apiError, fakeThoughtRecord, fakeUser, loggedIn, server } from '../test/server';

// Explicação alternativa, "como me sinto agora" e card de Novidades (DEC-054, DEC-055).
// Dados fictícios (regra 5). "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

function serveList(records: ThoughtRecord[]) {
  server.use(http.get('*/api/thought-records', () => HttpResponse.json({ thoughtRecords: records })));
}

function serveRecord(record: ThoughtRecord) {
  server.use(http.get(`*/api/thought-records/${record.id}`, () => HttpResponse.json({ thoughtRecord: record })));
}

// Guarda as escritas e responde com o registro do corpo.
function recordWrites(custom?: (path: string) => Response | undefined) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api/, '');
      const body = JSON.parse((await request.text()) || 'null');
      writes.push({ method, path, body });
      const response = custom?.(path);
      if (response) return response;
      if (path.startsWith('/auth/')) return HttpResponse.json({ user: { ...fakeUser, pendingAnnouncement: null } });
      return HttpResponse.json({ thoughtRecord: fakeThoughtRecord(body as Partial<ThoughtRecord>) });
    };
  server.use(
    http.post('*/api/thought-records', handle('POST')),
    http.post('*/api/thought-records/:id/alternative', handle('POST')),
    http.post('*/api/auth/announcement-seen', handle('POST')),
  );
  return writes;
}

// Registro de ontem, já travado, com duas emoções.
function lockedRecord(overrides: Partial<ThoughtRecord> = {}) {
  return fakeThoughtRecord({
    situationDate: '2026-09-23',
    situation: 'Situação de ontem',
    automaticThought: 'Pensamento de ontem',
    editable: false,
    createdAt: '2026-09-23T15:00:00.000Z',
    emotions: [
      { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: null, otherLabel: null },
      { emotion: 'MEDO', intensity: 5, intensityAfter: null, otherLabel: null },
    ],
    ...overrides,
  });
}

describe('cartão do registro', () => {
  it('mostra a alternativa em destaque, quando entrou e as emoções antes → agora', async () => {
    serveList([
      lockedRecord({
        alternativeExplanation: 'Outro jeito fictício de ver',
        alternativeAddedAt: '2026-09-24T12:00:00.000Z',
        emotions: [
          { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 4, otherLabel: null },
          { emotion: 'MEDO', intensity: 5, intensityAfter: 2, otherLabel: null },
        ],
      }),
    ]);
    renderRoute('/pensamentos?ciclo=2026-09-23');

    const card = await screen.findByRole('article', { name: 'Registro: Situação de ontem' });
    expect(within(card).getByText('Explicação alternativa')).toBeInTheDocument();
    expect(within(card).getByText('Outro jeito fictício de ver')).toBeInTheDocument();
    expect(within(card).getByText('Adicionada em 24/09')).toBeInTheDocument();
    expect(within(card).getByLabelText('intensidade 8 de 10; agora, 4 de 10')).toHaveTextContent('8 → 4');
    // Já tem alternativa: nem botão, nem convite.
    expect(within(card).queryByRole('link', { name: 'Adicionar explicação alternativa' })).not.toBeInTheDocument();
  });

  it('alternativa escrita no dia não mostra a data', async () => {
    serveList([lockedRecord({ alternativeExplanation: 'No mesmo dia', alternativeAddedAt: '2026-09-23T16:00:00.000Z' })]);
    renderRoute('/pensamentos?ciclo=2026-09-23');

    const card = await screen.findByRole('article', { name: 'Registro: Situação de ontem' });
    expect(within(card).queryByText(/Adicionada em/)).not.toBeInTheDocument();
  });

  it('sem alternativa e dentro do prazo: o botão com a data da consulta', async () => {
    serveList([lockedRecord({ canAddAlternative: true, alternativeDeadline: { date: '2026-09-25', time: '10:00' } })]);
    renderRoute('/pensamentos?ciclo=2026-09-23');

    const card = await screen.findByRole('article', { name: 'Registro: Situação de ontem' });
    expect(within(card).getByRole('link', { name: 'Adicionar explicação alternativa' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/pensamentos\/.+\/alternativa$/),
    );
    expect(within(card).getByText('até sex, 25/09, às 10:00')).toBeInTheDocument();
  });

  it('prazo encerrado: nada sobre a alternativa', async () => {
    serveList([lockedRecord({ canAddAlternative: false, alternativeDeadline: { date: '2026-09-23', time: '10:00' } })]);
    renderRoute('/pensamentos?ciclo=2026-09-23');

    const card = await screen.findByRole('article', { name: 'Registro: Situação de ontem' });
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    expect(within(card).queryByText(/explicação alternativa/i)).not.toBeInTheDocument();
  });
});

describe('formulário do registro', () => {
  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Situação'), 'Reunião fictícia');
    await user.type(screen.getByLabelText('Pensamento automático'), 'Vou errar');
    fireEvent.change(screen.getByLabelText('O quanto acredito nesse pensamento'), { target: { value: '8' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ansiedade' }));
    fireEvent.change(screen.getByLabelText('Intensidade: ansiedade'), { target: { value: '9' } });
    await user.type(screen.getByLabelText('Comportamento'), 'Fiquei calado');
    await user.type(screen.getByLabelText('Consequência'), 'Saí cansado');
  }

  it('a alternativa é opcional e o "como me sinto agora" só aparece com ela escrita', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/pensamentos/novo');

    await fillRequired(user);
    expect(screen.queryByText('Como me sinto agora')).not.toBeInTheDocument();
    expect(screen.getByText(/^Opcional\. Existe outro jeito de olhar/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).not.toHaveProperty('alternativeExplanation');
  });

  it('com a alternativa e a reavaliação: pede a nota de agora e manda tudo', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/pensamentos/novo');

    await fillRequired(user);
    await user.type(screen.getByLabelText('Explicação alternativa'), 'Talvez dê certo');
    await user.click(screen.getByRole('checkbox', { name: 'Quero dizer como me sinto agora' }));
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));
    expect(await screen.findByText('Escolha como está agora, de 0 a 10.')).toBeInTheDocument();
    expect(writes).toEqual([]);

    fireEvent.change(screen.getByLabelText('Ansiedade: agora'), { target: { value: '3' } });
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({
      alternativeExplanation: 'Talvez dê certo',
      emotions: [{ emotion: 'ANSIEDADE', intensity: 9, intensityAfter: 3 }],
    });
  });
});

describe('/pensamentos/:id/alternativa', () => {
  it('mostra a situação e o pensamento, e adiciona com a reavaliação', async () => {
    const record = lockedRecord({ canAddAlternative: true, alternativeDeadline: { date: '2026-09-25', time: '10:00' } });
    serveRecord(record);
    const writes = recordWrites();
    const user = userEvent.setup();
    const { router } = renderRoute(`/pensamentos/${record.id}/alternativa`);

    expect(await screen.findByText('Situação de ontem')).toBeInTheDocument();
    expect(screen.getByText('Pensamento de ontem')).toBeInTheDocument();
    expect(screen.getByText(/uma vez, até sex, 25\/09, às 10:00/)).toBeInTheDocument();
    // Aqui a alternativa é o que se está adicionando: a dica não diz "Opcional".
    expect(screen.getByText(/^Existe outro jeito de olhar/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Explicação alternativa'), 'Outro jeito fictício');
    await user.click(screen.getByRole('checkbox', { name: 'Quero dizer como me sinto agora' }));
    fireEvent.change(screen.getByLabelText('Ansiedade: agora'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Medo: agora'), { target: { value: '2' } });
    await user.click(screen.getByRole('button', { name: 'Salvar explicação alternativa' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: `/thought-records/${record.id}/alternative`,
      body: {
        alternativeExplanation: 'Outro jeito fictício',
        emotionsAfter: [
          { emotion: 'ANSIEDADE', intensityAfter: 4 },
          { emotion: 'MEDO', intensityAfter: 2 },
        ],
      },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/pensamentos'));
    expect(await screen.findByText('Explicação alternativa adicionada.')).toBeInTheDocument();
  });

  it('sem texto, não envia', async () => {
    const record = lockedRecord({ canAddAlternative: true, alternativeDeadline: { date: '2026-09-25', time: '10:00' } });
    serveRecord(record);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute(`/pensamentos/${record.id}/alternativa`);

    await user.click(await screen.findByRole('button', { name: 'Salvar explicação alternativa' }));

    expect(await screen.findByText('Escreva a explicação alternativa.')).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('a API recusa (409): mostra a mensagem dela, sem formulário', async () => {
    const record = lockedRecord({ canAddAlternative: true, alternativeDeadline: { date: '2026-09-25', time: '10:00' } });
    serveRecord(record);
    recordWrites(() =>
      apiError(409, 'ALTERNATIVE_DEADLINE_PASSED', 'A explicação alternativa podia ser adicionada até a hora da consulta.'),
    );
    const user = userEvent.setup();
    renderRoute(`/pensamentos/${record.id}/alternativa`);

    await user.type(await screen.findByLabelText('Explicação alternativa'), 'Tarde demais');
    await user.click(screen.getByRole('button', { name: 'Salvar explicação alternativa' }));

    expect(await screen.findByText(/podia ser adicionada até a hora da consulta/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar explicação alternativa' })).not.toBeInTheDocument();
  });

  it('sem consulta agendada: o convite, sem formulário', async () => {
    const record = lockedRecord();
    serveRecord(record);
    renderRoute(`/pensamentos/${record.id}/alternativa`);

    expect(
      await screen.findByText('Agende sua próxima consulta para poder adicionar a explicação alternativa.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Explicação alternativa')).not.toBeInTheDocument();
  });

  it('registro de hoje: leva ao formulário de edição', async () => {
    const record = fakeThoughtRecord();
    serveRecord(record);
    renderRoute(`/pensamentos/${record.id}/alternativa`);

    expect(await screen.findByRole('link', { name: 'Editar registro' })).toHaveAttribute(
      'href',
      `/pensamentos/${record.id}/editar`,
    );
  });
});

describe('card de Novidades', () => {
  const withAnnouncement = (profiles = fakeUser.profiles) =>
    http.get('*/api/auth/me', () =>
      HttpResponse.json({ user: { ...fakeUser, profiles, pendingAnnouncement: '2026-10-explicacao-alternativa' } }),
    );

  it('aparece até o "Entendi", que avisa a API', async () => {
    server.use(withAnnouncement());
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    const card = await screen.findByRole('region', { name: /Novidade no Registro de Pensamentos/ });
    expect(within(card).getByText(/você pode adicioná-la ao registro até a hora da sua/)).toBeInTheDocument();
    expect(within(card).queryByText(/Nos registros dos seus pacientes/)).not.toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Entendi' }));

    await waitFor(() => expect(screen.queryByRole('region', { name: /Novidade/ })).not.toBeInTheDocument());
    expect(writes).toEqual([
      { method: 'POST', path: '/auth/announcement-seen', body: { announcement: '2026-10-explicacao-alternativa' } },
    ]);
  });

  it('para quem é só terapeuta: o texto da terapeuta, sem o atalho de paciente', async () => {
    server.use(withAnnouncement({ patient: false, therapist: true }));
    renderRoute('/pacientes');

    const card = await screen.findByRole('region', { name: /Novidade/ });
    expect(within(card).getByText(/Nos registros dos seus pacientes/)).toBeInTheDocument();
    expect(within(card).queryByText(/você pode adicioná-la/)).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Ver meus pensamentos' })).not.toBeInTheDocument();
  });

  it('novidade que o front não conhece não aparece', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, pendingAnnouncement: 'outra-coisa' } })),
    );
    renderRoute('/registros');

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Novidade/ })).not.toBeInTheDocument();
  });
});

describe('resumo do ciclo', () => {
  it('conta os pensamentos com alternativa só quando há algum', () => {
    const range = { from: '2026-09-18', to: '2026-09-24' };
    expect(cycleSummaryText(range, { thoughts: 2, thoughtsWithAlternative: 1 })).toBe(
      '7 dias · 2 pensamentos registrados (1 com explicação alternativa)',
    );
    expect(cycleSummaryText(range, { thoughts: 2, thoughtsWithAlternative: 0 })).toBe(
      '7 dias · 2 pensamentos registrados',
    );
  });
});
