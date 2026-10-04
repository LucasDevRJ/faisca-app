import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action } from '../features/actions/actions-api';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

// Ação (DEC-051, DEC-052). "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo. Dados fictícios (regra 5).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

let seq = 0;
function fakeAction(overrides: Partial<Action> = {}): Action {
  seq += 1;
  return {
    id: `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`,
    actionDate: '2026-09-24',
    name: 'Ação fictícia',
    category: 'PRAZER',
    status: 'PLANEJADA',
    expectation: 3,
    pleasure: null,
    achievement: null,
    observation: null,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

// Ciclo da consulta de segunda, 28/09 (a anterior foi na segunda, 21/09).
const CYCLE = {
  from: '2026-09-22',
  to: '2026-09-28',
  session: { date: '2026-09-28', time: '14:00', kind: 'RECORRENTE' },
  truncated: false,
  previous: '2026-09-21',
  next: '2026-09-29',
};
const PREVIOUS_CYCLE = { ...CYCLE, from: '2026-09-15', to: '2026-09-21', previous: '2026-09-14', next: '2026-09-22' };

// Responde o ciclo e as ações do período pedido.
function actionsApi(actions: Action[]) {
  server.use(
    http.get('*/api/appointments/cycle', ({ request }) => {
      const date = new URL(request.url).searchParams.get('date');
      return HttpResponse.json({ today: '2026-09-24', cycle: date === '2026-09-21' ? PREVIOUS_CYCLE : CYCLE });
    }),
    http.get('*/api/actions', ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      return HttpResponse.json({ actions: actions.filter((a) => a.actionDate >= from && a.actionDate <= to) });
    }),
  );
}

function recordWrites() {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ method, path: new URL(request.url).pathname.replace(/^\/api/, ''), body });
      if (method === 'DELETE') return new HttpResponse(null, { status: 204 });
      return HttpResponse.json({ action: fakeAction({ ...(body as object) }) }, { status: method === 'POST' ? 201 : 200 });
    };
  server.use(
    http.post('*/api/actions*', handle('POST')),
    http.patch('*/api/actions/:id', handle('PATCH')),
    http.delete('*/api/actions/:id', handle('DELETE')),
  );
  return writes;
}

describe('/acao', () => {
  it('sem o aceite da Ação: a explicação e o pedido de aceite, sem buscar', async () => {
    let asked = false;
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, privacyUpToDate: false, privacyAreas: { ...fakeUser.privacyAreas, actions: false } } }),
      ),
      http.get('*/api/actions', () => {
        asked = true;
        return HttpResponse.json({ actions: [] });
      }),
    );
    renderRoute('/acao');

    expect(await screen.findByRole('heading', { name: 'Antes de começar' })).toBeInTheDocument();
    expect(screen.getByText('O que é a Ação?')).toBeInTheDocument();
    expect(screen.getByText(/incluir a Ação/)).toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it('quatro abas, a meta do ciclo em espaços e o cartão com a expectativa ao lado do resultado', async () => {
    actionsApi([
      fakeAction({ name: 'Ouvir um disco', category: 'PRAZER', status: 'AVALIADA', expectation: 3, pleasure: 7, achievement: 6, actionDate: '2026-09-23' }),
      fakeAction({ name: 'Café com amiga', category: 'CONEXAO', status: 'NAO_REALIZADA', actionDate: '2026-09-22', observation: 'Ela desmarcou.' }),
    ]);
    renderRoute('/acao');

    const tabs = await screen.findByRole('navigation', { name: 'Registros' });
    expect(within(tabs).getAllByRole('link').map((l) => l.textContent)).toEqual(['Atividades', 'Pensamentos', 'Tensão', 'Ação']);
    expect(await screen.findByRole('heading', { name: 'Consulta de 28/09' })).toBeInTheDocument();

    const goal = await screen.findByRole('region', { name: 'Neste ciclo' });
    expect(within(goal).getByRole('img', { name: 'Prazer: 1 de 1 feita' })).toBeInTheDocument();
    // Não realizada não preenche o espaço, e nada de "faltam".
    expect(within(goal).getByRole('img', { name: 'Conexão: 0 de 1 feita' })).toBeInTheDocument();
    expect(goal).not.toHaveTextContent(/falta/i);

    const done = screen.getByRole('article', { name: 'Ouvir um disco' });
    expect(done).toHaveTextContent('Esperava3');
    expect(done).toHaveTextContent('Prazer7');
    expect(within(done).queryByRole('button')).not.toBeInTheDocument();
    const notDone = screen.getByRole('article', { name: 'Café com amiga' });
    expect(notDone).toHaveTextContent('Não deu desta vez');
    expect(notDone).toHaveTextContent('Ela desmarcou.');

    expect(screen.getByRole('table', { name: 'Notas das ações feitas no ciclo' })).toBeInTheDocument();
  });

  it('planejada de hoje: "Conta como foi?" envia prazer e realização', async () => {
    const action = fakeAction({ name: 'Caminhar', expectation: 2 });
    actionsApi([action]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Caminhar' });
    await user.click(within(card).getByRole('button', { name: 'Conta como foi?' }));
    const dialog = screen.getByRole('dialog', { name: 'Conta como foi?' });
    expect(dialog).toHaveTextContent('você esperava 2 de 10');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(within(dialog).getAllByText('Escolha uma nota.')).toHaveLength(2);

    fireEvent.change(within(dialog).getByLabelText('Prazer'), { target: { value: '7' } });
    fireEvent.change(within(dialog).getByLabelText('Realização'), { target: { value: '6' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.path).toBe(`/actions/${action.id}/evaluate`);
    expect(writes[0]!.body).toEqual({ pleasure: 7, achievement: 6 });
  });

  it('planejada de um dia que ainda não chegou: sem "Conta como foi?", com editar e excluir', async () => {
    actionsApi([fakeAction({ name: 'Cinema', actionDate: '2026-09-26' })]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Cinema' });
    expect(within(card).queryByRole('button', { name: 'Conta como foi?' })).not.toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Editar Cinema' })).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Excluir' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Excluir esta ação?' })).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(writes.map((w) => w.method)).toEqual(['DELETE']));
  });

  it('"Não deu desta vez" grava com a observação opcional', async () => {
    const action = fakeAction({ name: 'Ligar para a família', category: 'CONEXAO' });
    actionsApi([action]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/acao');

    const card = await screen.findByRole('article', { name: 'Ligar para a família' });
    await user.click(within(card).getByRole('button', { name: 'Não deu desta vez' }));
    const dialog = screen.getByRole('dialog', { name: 'Tudo bem, não deu desta vez' });
    await user.type(within(dialog).getByLabelText('Observação (opcional)'), 'Fica para a próxima');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: `/actions/${action.id}/not-done`, body: { observation: 'Fica para a próxima' } },
      ]),
    );
  });

  it('"Repetir do ciclo passado" leva ao formulário já com o nome e o tipo', async () => {
    actionsApi([fakeAction({ name: 'Ouvir um disco', category: 'PRAZER', status: 'AVALIADA', pleasure: 7, achievement: 5, actionDate: '2026-09-17' })]);
    renderRoute('/acao');

    const repeat = await screen.findByRole('region', { name: 'Repetir do ciclo passado' });
    const link = within(repeat).getByRole('link', { name: 'Ouvir um disco · Prazer' });
    expect(link).toHaveAttribute('href', '/acao/nova?nome=Ouvir+um+disco&tipo=PRAZER');
  });
});

describe('/acao/nova', () => {
  function chooseScore(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label, { selector: 'input[type="range"]' }), { target: { value } });
  }

  it('planejar: tipo com exemplo, nome, dia e expectativa; volta para o ciclo do dia', async () => {
    actionsApi([]);
    const writes = recordWrites();
    const user = userEvent.setup();
    const { router } = renderRoute('/acao/nova?dia=2026-09-26');

    await user.click(await screen.findByLabelText(/Conexão/, { selector: 'input[type="radio"]' }));
    expect(screen.getByLabelText('O que você vai fazer?')).toHaveAttribute('placeholder', 'Ex.: tomar um café com uma amiga');
    await user.type(screen.getByLabelText('O que você vai fazer?'), '  Cinema com amigos ');
    chooseScore('Quanto espera gostar', '4');
    await user.click(screen.getByRole('button', { name: 'Salvar ação' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual({
      status: 'PLANEJADA',
      actionDate: '2026-09-26',
      name: 'Cinema com amigos',
      category: 'CONEXAO',
      expectation: 4,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/acao'));
  });

  it('"Já fiz": pede prazer e realização e grava já avaliada; dia fora da janela não envia', async () => {
    actionsApi([]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/acao/nova');

    await user.click(await screen.findByRole('button', { name: 'Já fiz' }));
    await user.click(screen.getByLabelText(/Realização/, { selector: 'input[type="radio"]' }));
    await user.type(screen.getByLabelText('O que você vai fazer?'), 'Arrumar a estante');
    const date = screen.getByLabelText('Dia');
    await user.clear(date);
    await user.type(date, '2026-09-10');
    chooseScore('Quanto espera gostar', '2');
    chooseScore('Prazer', '6');
    chooseScore('Realização', '9');
    await user.click(screen.getByRole('button', { name: 'Salvar ação' }));
    expect(screen.getByText('Dá para registrar o que foi feito nos últimos 7 dias.')).toBeInTheDocument();
    expect(writes).toEqual([]);

    await user.clear(date);
    await user.type(date, '2026-09-22');
    await user.click(screen.getByRole('button', { name: 'Salvar ação' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toEqual(
      expect.objectContaining({ status: 'AVALIADA', actionDate: '2026-09-22', category: 'REALIZACAO', expectation: 2, pleasure: 6, achievement: 9 }),
    );
  });

  it('vindo do "Repetir": nome e tipo já preenchidos', async () => {
    actionsApi([]);
    renderRoute('/acao/nova?nome=Ouvir%20um%20disco&tipo=PRAZER');

    expect(await screen.findByLabelText('O que você vai fazer?')).toHaveValue('Ouvir um disco');
    expect(screen.getByLabelText(/Prazer/, { selector: 'input[type="radio"]' })).toBeChecked();
  });
});
