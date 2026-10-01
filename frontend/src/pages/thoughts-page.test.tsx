import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import { renderRoute } from '../test/render';
import { apiError, fakeThoughtRecord, fakeUser, loggedIn, server } from '../test/server';

// Registro de Pensamentos do paciente (DEC-039, DEC-040). Dados fictícios (regra 5).
// "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

const outdatedUser = http.get('*/api/auth/me', () =>
  HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: false } }),
);

// Responde a semana pedida e guarda os períodos de cada chamada.
function weekHandler(records: ThoughtRecord[]) {
  const calls: { from: string | null; to: string | null }[] = [];
  server.use(
    http.get('*/api/thought-records', ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      calls.push({ from, to });
      return HttpResponse.json({
        thoughtRecords: records.filter((r) => from && to && r.situationDate >= from && r.situationDate <= to),
      });
    }),
  );
  return calls;
}

// Guarda as escritas (método, caminho e corpo).
function recordWrites(responses: Partial<Record<string, (body: unknown) => Response>> = {}) {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api/, '');
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ method, path, body });
      const custom = responses[`${method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`];
      if (custom) return custom(body);
      if (method === 'DELETE') return new HttpResponse(null, { status: 204 });
      return HttpResponse.json(
        { thoughtRecord: fakeThoughtRecord(body as Partial<ThoughtRecord>) },
        { status: method === 'POST' ? 201 : 200 },
      );
    };
  server.use(
    http.post('*/api/thought-records', handle('POST')),
    http.patch('*/api/thought-records/:id', handle('PATCH')),
    http.delete('*/api/thought-records/:id', handle('DELETE')),
    http.post('*/api/auth/accept-privacy', handle('POST')),
  );
  return writes;
}

describe('/pensamentos', () => {
  it('abas Atividades e Pensamentos; a semana mostra só os dias com registro', async () => {
    const calls = weekHandler([
      fakeThoughtRecord({ situation: 'Reunião no trabalho', situationDate: '2026-09-22' }),
      fakeThoughtRecord({ situation: 'Ligação da família', situationDate: '2026-09-24' }),
      fakeThoughtRecord({ situation: 'Outra semana', situationDate: '2026-09-28' }),
    ]);
    renderRoute('/pensamentos');

    const tabs = await screen.findByRole('navigation', { name: 'Registros' });
    expect(within(tabs).getByRole('link', { name: 'Pensamentos' })).toHaveAttribute('aria-current', 'page');
    expect(within(tabs).getByRole('link', { name: 'Atividades' })).toHaveAttribute('href', '/registros');
    expect(await screen.findByRole('article', { name: 'Registro: Reunião no trabalho' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Registro: Ligação da família' })).toBeInTheDocument();
    expect(screen.queryByText('Outra semana')).not.toBeInTheDocument();
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'terça-feira, 22/09',
      'quinta-feira, 24/09hoje',
    ]);
  });

  it('o cartão mostra todos os campos e as emoções com intensidade', async () => {
    weekHandler([
      fakeThoughtRecord({
        emotions: [
          { emotion: 'TRISTEZA', intensity: 6, otherLabel: null },
          { emotion: 'OUTRA', intensity: 3, otherLabel: 'Inquietação' },
        ],
      }),
    ]);
    renderRoute('/pensamentos');

    const card = await screen.findByRole('article', { name: 'Registro: Situação fictícia' });
    for (const text of ['Situação fictícia', 'Pensamento fictício', 'Comportamento fictício', 'Consequência fictícia']) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    expect(within(card).getByText(/Acredito:/)).toHaveTextContent('Acredito: 7 de 10');
    expect(within(card).getByText('Tristeza')).toBeInTheDocument();
    expect(within(card).getByText('Inquietação')).toBeInTheDocument();
    expect(within(card).getByLabelText('intensidade 3 de 10')).toBeInTheDocument();
  });

  it('registro de hoje tem Editar e Excluir; de outro dia, só "Registrado em"', async () => {
    weekHandler([
      fakeThoughtRecord({ situation: 'De hoje' }),
      fakeThoughtRecord({ situation: 'Antigo', editable: false, createdAt: '2026-09-22T15:00:00.000Z' }),
    ]);
    renderRoute('/pensamentos');

    const today = await screen.findByRole('article', { name: 'Registro: De hoje' });
    const old = screen.getByRole('article', { name: 'Registro: Antigo' });
    expect(within(today).getByRole('link', { name: 'Editar' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/pensamentos\/.+\/editar$/),
    );
    expect(within(today).getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(within(old).queryByRole('button')).not.toBeInTheDocument();
    expect(within(old).queryByRole('link')).not.toBeInTheDocument();
    expect(within(old).getByText(/Registrado em/)).toHaveTextContent('Registrado em 22/09, 12:00');
  });

  it('excluir pede confirmação, apaga e avisa', async () => {
    const record = fakeThoughtRecord();
    weekHandler([record]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/pensamentos');

    const card = await screen.findByRole('article', { name: 'Registro: Situação fictícia' });
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    const dialog = await screen.findByRole('dialog', { name: 'Excluir este registro?' });
    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(writes).toEqual([{ method: 'DELETE', path: `/thought-records/${record.id}`, body: undefined }]));
    expect(await screen.findByText('Registro excluído.')).toBeInTheDocument();
  });

  it('excluir depois do prazo (409): avisa e não insiste', async () => {
    weekHandler([fakeThoughtRecord()]);
    recordWrites({
      'DELETE /thought-records/:id': () =>
        apiError(409, 'THOUGHT_RECORD_LOCKED', 'Este registro só podia ser alterado no dia em que foi feito.'),
    });
    const user = userEvent.setup();
    renderRoute('/pensamentos');

    const card = await screen.findByRole('article', { name: 'Registro: Situação fictícia' });
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByText('Este registro só podia ser alterado no dia em que foi feito.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('semana vazia: texto acolhedor e o botão de novo registro', async () => {
    renderRoute('/pensamentos');

    expect(await screen.findByText(/Nada anotado nesta semana/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Novo registro/ })).toHaveAttribute('href', '/pensamentos/novo?dia=2026-09-24');
  });
});

describe('novo aceite do aviso de privacidade (DEC-039)', () => {
  it('sem o aceite: nada é buscado e aparece o pedido, com a caixa desmarcada', async () => {
    server.use(outdatedUser);
    const calls = weekHandler([fakeThoughtRecord()]);
    renderRoute('/pensamentos');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'aviso de privacidade' })).toHaveAttribute('target', '_blank');
    expect(calls).toEqual([]);
    // Em /pensamentos o próprio pedido explica: sem a faixa repetida.
    expect(screen.queryByText(/Ver o que mudou/)).not.toBeInTheDocument();
  });

  it('sem marcar a caixa, não envia; marcando, aceita e libera a lista', async () => {
    let accepted = false;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: accepted } })),
    );
    weekHandler([fakeThoughtRecord({ situation: 'Depois do aceite' })]);
    const writes = recordWrites({
      'POST /auth/accept-privacy': () => {
        accepted = true;
        return HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: true } });
      },
    });
    const user = userEvent.setup();
    renderRoute('/pensamentos');

    await user.click(await screen.findByRole('button', { name: 'Aceitar e continuar' }));
    expect(await screen.findByText(/marque que você leu e concorda/)).toBeInTheDocument();
    expect(writes).toEqual([]);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));

    expect(await screen.findByRole('article', { name: 'Registro: Depois do aceite' })).toBeInTheDocument();
    expect(writes).toEqual([{ method: 'POST', path: '/auth/accept-privacy', body: { acceptPrivacy: true } }]);
  });

  it('se a API pedir o aceite (403), mostra o pedido mesmo com a sessão em dia', async () => {
    server.use(
      http.get('*/api/thought-records', () =>
        apiError(403, 'PRIVACY_CONSENT_REQUIRED', 'Para usar o Registro de Pensamentos, aceite o aviso.'),
      ),
    );
    renderRoute('/pensamentos');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
  });

  it('a faixa avisa em /registros enquanto o aceite não é feito', async () => {
    server.use(outdatedUser);
    renderRoute('/registros');

    expect(await screen.findByText(/Atualizamos o aviso de privacidade/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o que mudou' })).toHaveAttribute('href', '/privacidade');
  });

  it('com o aceite em dia, não há faixa', async () => {
    renderRoute('/registros');

    expect(await screen.findByRole('navigation', { name: 'Registros' })).toBeInTheDocument();
    expect(screen.queryByText(/Atualizamos o aviso de privacidade/)).not.toBeInTheDocument();
  });
});

describe('/pensamentos/novo', () => {
  async function fillAll(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Situação'), 'Reunião no trabalho');
    await user.type(screen.getByLabelText('Pensamento automático'), 'Vou errar tudo');
    fireEvent.change(screen.getByLabelText('O quanto acredito nesse pensamento'), { target: { value: '8' } });
    await user.click(screen.getByRole('checkbox', { name: 'Ansiedade' }));
    fireEvent.change(screen.getByLabelText('Intensidade: ansiedade'), { target: { value: '9' } });
    await user.click(screen.getByRole('checkbox', { name: 'Outra' }));
    await user.type(screen.getByLabelText('Qual emoção?'), 'Inquietação');
    fireEvent.change(screen.getByLabelText('Intensidade: Inquietação'), { target: { value: '4' } });
    await user.type(screen.getByLabelText('Comportamento'), 'Fiquei calado');
    await user.type(screen.getByLabelText('Consequência'), 'Saí cansado');
  }

  it('todos os campos são obrigatórios: sem preencher, nada é enviado', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/pensamentos/novo');

    await user.click(await screen.findByRole('button', { name: 'Salvar registro' }));

    expect(await screen.findByText('Conte qual foi a situação.')).toBeInTheDocument();
    expect(screen.getByText('Conte qual pensamento veio.')).toBeInTheDocument();
    expect(screen.getByText('Escolha pelo menos uma emoção.')).toBeInTheDocument();
    expect(screen.getByText('Conte o que você fez.')).toBeInTheDocument();
    expect(screen.getByText('Conte qual foi a consequência.')).toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it('emoção marcada pede intensidade, e "outra" pede o nome', async () => {
    recordWrites();
    const user = userEvent.setup();
    renderRoute('/pensamentos/novo');

    await user.click(await screen.findByRole('checkbox', { name: 'Medo' }));
    await user.click(screen.getByRole('checkbox', { name: 'Outra' }));
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    expect(await screen.findAllByText('Escolha a intensidade, de 0 a 10.')).toHaveLength(2);
    expect(screen.getByText('Escreva o nome da emoção.')).toBeInTheDocument();
  });

  it('salva o registro completo e volta para a semana com o aviso', async () => {
    const writes = recordWrites();
    const user = userEvent.setup();
    const { router } = renderRoute('/pensamentos/novo?dia=2026-09-23');

    await fillAll(user);
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      method: 'POST',
      path: '/thought-records',
      body: {
        situationDate: '2026-09-23',
        situation: 'Reunião no trabalho',
        automaticThought: 'Vou errar tudo',
        beliefLevel: 8,
        emotions: [
          { emotion: 'ANSIEDADE', intensity: 9 },
          { emotion: 'OUTRA', intensity: 4, otherLabel: 'Inquietação' },
        ],
        behavior: 'Fiquei calado',
        consequence: 'Saí cansado',
      },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/pensamentos'));
    expect(await screen.findByText('Registro salvo.')).toBeInTheDocument();
  });

  it('erro da API aparece no formulário, sem perder o que foi escrito', async () => {
    recordWrites({ 'POST /thought-records': () => apiError(400, 'DATE_IN_FUTURE', 'A situação precisa ser de hoje ou de um dia anterior.') });
    const user = userEvent.setup();
    renderRoute('/pensamentos/novo');

    await fillAll(user);
    await user.click(screen.getByRole('button', { name: 'Salvar registro' }));

    expect(await screen.findByText('A situação precisa ser de hoje ou de um dia anterior.')).toBeInTheDocument();
    expect(screen.getByLabelText('Situação')).toHaveValue('Reunião no trabalho');
  });

  it('sem o aceite do aviso, mostra o pedido no lugar do formulário', async () => {
    server.use(outdatedUser);
    renderRoute('/pensamentos/novo');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar registro' })).not.toBeInTheDocument();
  });
});

describe('/pensamentos/:id/editar', () => {
  function serveRecord(record: ThoughtRecord) {
    server.use(http.get(`*/api/thought-records/${record.id}`, () => HttpResponse.json({ thoughtRecord: record })));
  }

  it('abre preenchido e manda o formulário inteiro', async () => {
    const record = fakeThoughtRecord({ situation: 'Situação antiga' });
    serveRecord(record);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute(`/pensamentos/${record.id}/editar`);

    const situation = await screen.findByLabelText('Situação');
    expect(situation).toHaveValue('Situação antiga');
    expect(screen.getByRole('checkbox', { name: 'Ansiedade' })).toBeChecked();
    await user.clear(situation);
    await user.type(situation, 'Situação nova');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toMatchObject({
      method: 'PATCH',
      path: `/thought-records/${record.id}`,
      body: { situation: 'Situação nova', beliefLevel: 7, emotions: [{ emotion: 'ANSIEDADE', intensity: 8 }] },
    });
    expect(await screen.findByText('Alterações salvas.')).toBeInTheDocument();
  });

  it('registro de outro dia: só o aviso, sem formulário', async () => {
    const record = fakeThoughtRecord({ editable: false });
    serveRecord(record);
    renderRoute(`/pensamentos/${record.id}/editar`);

    expect(await screen.findByText(/só podia ser alterado no dia em que foi feito/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Situação')).not.toBeInTheDocument();
  });

  it('o prazo acaba com a tela aberta (409): mostra o aviso', async () => {
    const record = fakeThoughtRecord();
    serveRecord(record);
    recordWrites({
      'PATCH /thought-records/:id': () =>
        apiError(409, 'THOUGHT_RECORD_LOCKED', 'Este registro só podia ser alterado no dia em que foi feito.'),
    });
    const user = userEvent.setup();
    renderRoute(`/pensamentos/${record.id}/editar`);

    await user.click(await screen.findByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByRole('link', { name: 'Voltar para o Registro de Pensamentos' })).toBeInTheDocument();
  });

  it('registro de outra pessoa (403): não mostra nada dele', async () => {
    server.use(
      http.get('*/api/thought-records/:id', () => apiError(403, 'FORBIDDEN', 'Você não tem acesso a este registro.')),
    );
    renderRoute('/pensamentos/00000000-0000-4000-9000-000000000999/editar');

    expect(await screen.findByText('Você não tem acesso a este registro.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Situação')).not.toBeInTheDocument();
  });
});
