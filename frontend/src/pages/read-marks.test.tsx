import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PatientSummary } from '../features/therapist/therapist-api';
import type { ReadInfo, UnreadResponse } from '../features/therapist/read-marks-api';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { renderRoute } from '../test/render';
import { fakeAgenda, fakeTensionEpisode, fakeThoughtRecord, fakeUser, outdatedPrivacy, server } from '../test/server';

// Telas do "Lido" da terapeuta (DEC-058). Dados fictícios (regra 5). "Hoje": quinta, 24/09/2026.
const PATIENT_ID = '00000000-0000-4000-8000-00000000000a';
const BASE = `*/api/therapist/patients/${PATIENT_ID}`;
const MARKS = `*/api/therapist/read-marks/${PATIENT_ID}`;
const TODAY = '2026-09-24';

const therapist = { ...fakeUser, profiles: { patient: false, therapist: true } };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: therapist })));
});

afterEach(() => {
  vi.useRealTimers();
});

const summary: PatientSummary = {
  patient: { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z' },
  today: TODAY,
  lastAppointment: null,
  nextAppointment: null,
  agendaStatus: 'SEM_AGENDA',
  pause: null,
  highlight: { from: '2026-09-18', to: TODAY, reason: 'LAST_7_DAYS' },
};

function withRead<T>(record: T, readStatus: ReadInfo['readStatus'], readAt: string | null = null) {
  return { ...record, readStatus, readAt };
}

const emptyUnread: UnreadResponse = {
  thoughtRecords: [],
  tensionEpisodes: [],
  actions: [],
  counts: { thoughtRecords: 0, tensionEpisodes: 0, actions: 0 },
};

// A API simulada da terapeuta: resumo, semana (sem ciclo), os pensamentos e os registros para ler.
// Guarda as escritas nas marcas.
function therapistApi({
  thoughts = [] as (ThoughtRecord & ReadInfo)[],
  unread = emptyUnread,
} = {}) {
  const writes: { method: string; body: unknown }[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json(summary)),
    http.get(`${BASE}/cycle`, () => HttpResponse.json({ today: TODAY, cycle: null })),
    http.get(`${BASE}/appointments`, () => HttpResponse.json(fakeAgenda())),
    http.get(`${BASE}/activities`, () => HttpResponse.json({ activities: [] })),
    http.get(`${BASE}/thought-records`, () => HttpResponse.json({ thoughtRecords: thoughts })),
    http.get(`${BASE}/unread`, () => HttpResponse.json(unread)),
    http.put(MARKS, async ({ request }) => {
      const body = (await request.json()) as { items: unknown[] };
      writes.push({ method: 'PUT', body });
      return HttpResponse.json({ marked: body.items.length, readAt: '2026-09-24T18:00:00.000Z' });
    }),
    http.delete(MARKS, async ({ request }) => {
      writes.push({ method: 'DELETE', body: await request.json() });
      return HttpResponse.json({ unmarked: 1 });
    }),
  );
  return writes;
}

describe('no cartão', () => {
  it('"Marcar como lido" grava a marca do registro', async () => {
    const record = fakeThoughtRecord({ situation: 'Para ler' });
    const writes = therapistApi({ thoughts: [withRead(record, 'NAO_LIDO')] });
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    const card = await screen.findByRole('article', { name: 'Registro: Para ler' });
    await user.click(within(card).getByRole('button', { name: 'Marcar como lido: Para ler' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ method: 'PUT', body: { items: [{ type: 'THOUGHT_RECORD', id: record.id }] } });
  });

  it('lido: a data e "Marcar como não lido", que desfaz', async () => {
    const record = fakeThoughtRecord({ situation: 'Já lido' });
    const writes = therapistApi({ thoughts: [withRead(record, 'LIDO', '2026-09-23T15:00:00.000Z')] });
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    const card = await screen.findByRole('article', { name: 'Registro: Já lido' });
    expect(within(card).getByText('Lido em 23/09')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Marcar como não lido: Já lido' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.method).toBe('DELETE');
  });

  it('se a marca não for gravada, avisa no cartão', async () => {
    therapistApi({ thoughts: [withRead(fakeThoughtRecord({ situation: 'Falhou' }), 'NAO_LIDO')] });
    server.use(http.put(MARKS, () => HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status: 500 })));
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    const card = await screen.findByRole('article', { name: 'Registro: Falhou' });
    await user.click(within(card).getByRole('button', { name: 'Marcar como lido: Falhou' }));

    expect(await within(card).findByRole('alert')).toHaveTextContent('Não deu para registrar agora');
  });

  it('atualizado: o selo e o botão para ler de novo', async () => {
    therapistApi({
      thoughts: [withRead(fakeThoughtRecord({ situation: 'Mudou' }), 'ATUALIZADO', '2026-09-22T15:00:00.000Z')],
    });
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    const card = await screen.findByRole('article', { name: 'Registro: Mudou' });
    expect(within(card).getByText('Atualizado depois que você leu')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Marcar como lido: Mudou' })).toBeInTheDocument();
  });
});

describe('"Marcar todos como lidos"', () => {
  it('marca só os pendentes da lista aberta, depois de confirmar', async () => {
    const a = fakeThoughtRecord({ situation: 'A' });
    const b = fakeThoughtRecord({ situation: 'B' });
    const c = fakeThoughtRecord({ situation: 'C' });
    const writes = therapistApi({
      thoughts: [withRead(a, 'NAO_LIDO'), withRead(b, 'ATUALIZADO'), withRead(c, 'LIDO', '2026-09-23T15:00:00.000Z')],
    });
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    await user.click(await screen.findByRole('button', { name: 'Marcar todos como lidos (2)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Marcar 2 registros como lidos?' });
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como lidos' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual({
      items: [
        { type: 'THOUGHT_RECORD', id: a.id },
        { type: 'THOUGHT_RECORD', id: b.id },
      ],
    });
    expect(await screen.findByRole('status')).toHaveTextContent('2 registros marcados como lidos.');
  });

  it('na aba, quando a lista fica sem pendentes, o foco vai para o aviso', async () => {
    const record = fakeThoughtRecord({ situation: 'A' });
    therapistApi({ thoughts: [withRead(record, 'NAO_LIDO')] });
    let marked = false;
    server.use(
      http.get(`${BASE}/thought-records`, () =>
        HttpResponse.json({
          thoughtRecords: [withRead(record, marked ? 'LIDO' : 'NAO_LIDO', marked ? '2026-09-24T18:00:00.000Z' : null)],
        }),
      ),
      http.put(MARKS, () => {
        marked = true;
        return HttpResponse.json({ marked: 1, readAt: '2026-09-24T18:00:00.000Z' });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    await user.click(await screen.findByRole('button', { name: 'Marcar todos como lidos (1)' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Marcar como lidos' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('1 registro marcado como lido.');
  });

  it('o nome do botão leva só o começo de uma situação longa', async () => {
    therapistApi({ thoughts: [withRead(fakeThoughtRecord({ situation: 'Uma situação '.repeat(20) }), 'NAO_LIDO')] });
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    const button = await screen.findByRole('button', { name: /^Marcar como lido: / });
    expect(button.getAttribute('aria-label')!.length).toBeLessThan(80);
    expect(button.getAttribute('aria-label')).toMatch(/…$/);
  });

  it('cancelar não grava nada; sem pendentes, o botão nem aparece', async () => {
    const writes = therapistApi({ thoughts: [withRead(fakeThoughtRecord({ situation: 'A' }), 'NAO_LIDO')] });
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    await user.click(await screen.findByRole('button', { name: 'Marcar todos como lidos (1)' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }));

    expect(writes).toEqual([]);
  });

  it('se não gravar, o aviso aparece no diálogo, que continua aberto', async () => {
    therapistApi({ thoughts: [withRead(fakeThoughtRecord({ situation: 'A' }), 'NAO_LIDO')] });
    server.use(http.put(MARKS, () => HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status: 500 })));
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=pensamentos&semana=2026-09-21`);

    await user.click(await screen.findByRole('button', { name: 'Marcar todos como lidos (1)' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como lidos' }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});

describe('registros para ler', () => {
  const old = fakeThoughtRecord({ situation: 'Pensamento antigo', situationDate: '2026-08-10' });
  const episode = fakeTensionEpisode({ situation: 'Tensão do meio', episodeDate: '2026-09-01' });
  const unread: UnreadResponse = {
    thoughtRecords: [withRead(old, 'NAO_LIDO')],
    tensionEpisodes: [withRead(episode, 'ATUALIZADO', '2026-09-02T12:00:00.000Z')],
    actions: [],
    counts: { thoughtRecords: 1, tensionEpisodes: 1, actions: 0 },
  };

  it('o card acima das abas, com a divisão e o contador nas abas', async () => {
    therapistApi({ unread });
    renderRoute(`/pacientes/${PATIENT_ID}`);

    const card = await screen.findByRole('region', { name: '2 registros para ler' });
    expect(within(card).getByText('1 pensamento · 1 episódio de tensão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pensamentos\s*, 1 para ler$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ação' })).toBeInTheDocument();
  });

  it('a visão junta as áreas do mais antigo ao mais novo e volta ao ciclo', async () => {
    therapistApi({ unread });
    const user = userEvent.setup();
    const { router } = renderRoute(`/pacientes/${PATIENT_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Ver os registros para ler' }));
    await waitFor(() => expect(router.state.location.search).toBe('?aba=para-ler'));

    expect(within(screen.getByRole('region', { name: 'Para ler' })).getAllByRole('article')).toHaveLength(2);
    expect(screen.getByText('Pensamento · seg, 10/08')).toBeInTheDocument();
    expect(screen.getByText('Tensão · ter, 01/09')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar todos como lidos (2)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '‹ Voltar ao ciclo' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('sem nada para ler: sem card nem contador no ciclo', async () => {
    therapistApi();
    let unreadAnswered = false;
    server.use(
      http.get(`${BASE}/unread`, () => {
        unreadAnswered = true;
        return HttpResponse.json(emptyUnread);
      }),
    );
    renderRoute(`/pacientes/${PATIENT_ID}`);

    // Só confere depois que a lista de "para ler" chegou: antes, o card não apareceria de todo jeito.
    await waitFor(() => expect(unreadAnswered).toBe(true));
    await screen.findByText(/^Nada registrado/);
    expect(screen.queryByRole('region', { name: /para ler$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pensamentos' })).toBeInTheDocument();
  });

  it('sem aceite em nenhuma das três áreas, um link para "Para ler" abre o ciclo', async () => {
    therapistApi({ unread });
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...therapist, ...outdatedPrivacy } })));
    renderRoute(`/pacientes/${PATIENT_ID}?aba=para-ler`);

    expect(await screen.findByText(/^Nada registrado/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Para ler' })).not.toBeInTheDocument();
    expect(screen.queryByText('Carregando os registros…')).not.toBeInTheDocument();
  });

  it('sem nada para ler: a visão diz que está tudo lido', async () => {
    therapistApi();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=para-ler`);

    expect(await screen.findByText('Você já leu todos os registros de Paula.')).toBeInTheDocument();
  });

  it('marcar na visão tira o registro e leva o foco ao título', async () => {
    therapistApi({ unread });
    let marked = false;
    server.use(
      http.get(`${BASE}/unread`, () => HttpResponse.json(marked ? emptyUnread : unread)),
      http.put(MARKS, () => {
        marked = true;
        return HttpResponse.json({ marked: 1, readAt: '2026-09-24T18:00:00.000Z' });
      }),
    );
    const user = userEvent.setup();
    renderRoute(`/pacientes/${PATIENT_ID}?aba=para-ler`);

    await user.click(await screen.findByRole('button', { name: 'Marcar como lido: Pensamento antigo' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Para ler' })).toHaveFocus());
  });
});

describe('lista de pacientes e Novidades', () => {
  it('"4 para ler" ao lado do nome; zero não mostra nada', async () => {
    server.use(
      http.get('*/api/links/patients', () =>
        HttpResponse.json({
          patients: [
            { id: PATIENT_ID, name: 'Paula Fictícia', email: 'paula@faisca.test', linkedAt: '2026-09-01T15:00:00.000Z', unreadCount: 4 },
            {
              id: '00000000-0000-4000-8000-00000000000b',
              name: 'Pedro Fictício',
              email: 'pedro@faisca.test',
              linkedAt: '2026-09-02T15:00:00.000Z',
              unreadCount: 0,
            },
          ],
        }),
      ),
      http.get('*/api/therapist/patients/:id', () => HttpResponse.json(summary)),
    );
    renderRoute('/pacientes');

    const paula = await screen.findByRole('link', { name: /Paula Fictícia/ });
    expect(within(paula).getByText('4 para ler')).toBeInTheDocument();
    const pedro = screen.getByRole('link', { name: /Pedro Fictício/ });
    expect(within(pedro).queryByText(/para ler/)).not.toBeInTheDocument();
  });

  it('a novidade do "Lido" aparece para a terapeuta e não para a paciente', async () => {
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...therapist, pendingAnnouncement: '2026-10-lido' } })),
    );
    const first = renderRoute('/pacientes');
    expect(await screen.findByRole('region', { name: 'Novidade: o que você ainda tem para ler' })).toBeInTheDocument();
    first.unmount();

    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, pendingAnnouncement: '2026-10-lido' } })),
    );
    renderRoute('/registros');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Novidade/ })).not.toBeInTheDocument();
  });
});
