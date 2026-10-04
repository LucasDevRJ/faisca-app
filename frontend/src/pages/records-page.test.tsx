import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
import { renderRoute } from '../test/render';
import { apiError, fakeActivity, loggedIn, server } from '../test/server';

// "Hoje" fixo: quinta, 24/09/2026, 15h em São Paulo. Só o relógio é simulado; os timers
// continuam reais para o MSW e o userEvent.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});

afterEach(() => {
  vi.useRealTimers();
});

// Responde a semana pedida e guarda os parâmetros de cada chamada.
function weekHandler(activities: Activity[]) {
  const calls: { from: string | null; to: string | null }[] = [];
  server.use(
    http.get('*/api/activities', ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      calls.push({ from, to });
      return HttpResponse.json({
        activities: activities.filter((a) => from && to && a.activityDate >= from && a.activityDate <= to),
      });
    }),
  );
  return calls;
}

// Guarda o corpo de cada POST/PATCH/DELETE de atividade, na ordem.
function recordWrites(
  responses: Partial<Record<string, (body: unknown) => Response>> = {},
): { method: string; path: string; body: unknown }[] {
  const writes: { method: string; path: string; body: unknown }[] = [];
  const handle =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api/, '');
      const text = await request.text();
      const body = text ? JSON.parse(text) : undefined;
      writes.push({ method, path, body });
      const key = `${method} ${path.replace(/[0-9a-f-]{36}/, ':id')}`;
      const custom = responses[key];
      if (custom) return custom(body);
      if (method === 'DELETE') return new HttpResponse(null, { status: 204 });
      return HttpResponse.json({ activity: fakeActivity(body as Partial<Activity>) }, { status: 201 });
    };
  server.use(
    http.post('*/api/activities', handle('POST')),
    http.post('*/api/activities/:id/:action', handle('POST')),
    http.patch('*/api/activities/:id', handle('PATCH')),
    http.delete('*/api/activities/:id', handle('DELETE')),
  );
  return writes;
}

async function findCard(name: string) {
  return screen.findByRole('article', { name });
}

describe('RecordsPage: semana', () => {
  it('abre a semana atual (segunda a domingo) e agrupa as atividades por dia', async () => {
    const calls = weekHandler([
      fakeActivity({ name: 'Ler um capítulo', activityDate: '2026-09-21' }),
      fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' }),
      fakeActivity({ name: 'Outra semana', activityDate: '2026-09-28' }),
    ]);
    renderRoute('/registros');

    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(calls[0]).toEqual({ from: '2026-09-21', to: '2026-09-27' });

    const monday = (await screen.findByRole('heading', { name: /segunda-feira, 21\/09/ })).closest('li')!;
    expect(within(monday).getByRole('article', { name: 'Ler um capítulo' })).toBeInTheDocument();
    const thursday = screen.getByRole('heading', { name: /quinta-feira, 24\/09/ }).closest('li')!;
    expect(within(thursday).getByText('hoje')).toBeInTheDocument();
    expect(within(thursday).getByRole('article', { name: 'Caminhada' })).toBeInTheDocument();
    expect(screen.queryByText('Outra semana')).not.toBeInTheDocument();
  });

  it('mostra uma mensagem acolhedora na semana vazia', async () => {
    renderRoute('/registros');

    expect(
      await screen.findByText('Nada registrado nesta semana ainda. Que tal planejar algo pequeno?'),
    ).toBeInTheDocument();
  });

  it('navega entre semanas pela URL e volta para a semana atual', async () => {
    const calls = weekHandler([]);
    const user = userEvent.setup();
    const { router } = renderRoute('/registros');

    await user.click(await screen.findByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByRole('heading', { name: '28 de set. a 4 de out.' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?semana=2026-09-28');
    await waitFor(() => expect(calls.at(-1)).toEqual({ from: '2026-09-28', to: '2026-10-04' }));

    await user.click(screen.getByRole('button', { name: 'Voltar para esta semana' }));
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Voltar para esta semana' })).not.toBeInTheDocument();
  });

  it('?semana= com qualquer dia abre a semana daquele dia; valor inválido abre a atual', async () => {
    const { unmount } = renderRoute('/registros?semana=2026-10-01');
    expect(await screen.findByRole('heading', { name: '28 de set. a 4 de out.' })).toBeInTheDocument();
    unmount();

    renderRoute('/registros?semana=bobagem');
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
  });

  it('avisa com calma quando a semana não carrega', async () => {
    server.use(http.get('*/api/activities', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/registros');

    expect(await screen.findByText(/Não conseguimos carregar este período/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('RecordsPage: ações por estado', () => {
  it('PLANEJADA de hoje: registrar vontade, contar como foi, não aconteceu, editar e excluir', async () => {
    weekHandler([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24', status: 'PLANEJADA' })]);
    renderRoute('/registros');

    const card = await findCard('Caminhada');
    for (const name of ['Registrar vontade', 'Conta como foi?', 'Não aconteceu', 'Editar', 'Excluir']) {
      expect(within(card).getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('dia que ainda não chegou: sem "Conta como foi?" nem "Não aconteceu"', async () => {
    weekHandler([fakeActivity({ name: 'Cinema', activityDate: '2026-09-26', status: 'PENDENTE', wantBefore: 6 })]);
    renderRoute('/registros');

    const card = await findCard('Cinema');
    expect(within(card).queryByRole('button', { name: 'Conta como foi?' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Não aconteceu' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it.each(['CONCLUIDA', 'NAO_REALIZADA'] as const)('%s é só leitura: nenhum botão', async (status) => {
    weekHandler([
      fakeActivity({
        name: 'Registro final',
        status,
        wantBefore: 3,
        ...(status === 'CONCLUIDA' ? { pleasure: 7, achievement: 8 } : {}),
        observation: 'Choveu um pouco.',
      }),
    ]);
    renderRoute('/registros');

    const card = await findCard('Registro final');
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    expect(within(card).getByText('Choveu um pouco.')).toBeInTheDocument();
  });

  it('o gráfico traz as notas das atividades feitas (tabela acessível)', async () => {
    weekHandler([
      fakeActivity({
        name: 'Caminhada',
        activityDate: '2026-09-24',
        status: 'CONCLUIDA',
        wantBefore: 2,
        pleasure: 7,
        achievement: 9,
      }),
      fakeActivity({ name: 'Planejada', status: 'PLANEJADA' }),
    ]);
    renderRoute('/registros');

    const table = await screen.findByRole('table', { name: 'Notas das atividades feitas na semana' });
    const row = within(table).getByRole('row', { name: 'Caminhada, qui, 24/09 2 7 9'});
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '7', '9']);
    expect(within(table).queryByText('Planejada')).not.toBeInTheDocument();
  });
});

describe('RecordsPage: nova atividade', () => {
  async function openCreate() {
    const user = userEvent.setup();
    renderRoute('/registros');
    await user.click(await screen.findByRole('button', { name: 'Nova atividade' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova atividade' });
    return { user, dialog };
  }

  it('planeja uma atividade para hoje', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByLabelText('O que você vai fazer (ou fez)?'), '  Ligar para uma amiga ');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toEqual([
      {
        method: 'POST',
        path: '/activities',
        body: { status: 'PLANEJADA', name: 'Ligar para uma amiga', activityDate: '2026-09-24' },
      },
    ]);
  });

  it('"Já fiz" de ontem: pede as três notas antes de enviar', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByLabelText('O que você vai fazer (ou fez)?'), 'Caminhada');
    fireEvent.change(within(dialog).getByLabelText('Dia'), { target: { value: '2026-09-23' } });
    await user.click(within(dialog).getByRole('radio', { name: /Já fiz/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    // Nenhuma nota escolhida: o slider não conta o valor do meio como resposta.
    expect(within(dialog).getAllByText('Escolha um número de 0 a 10.')).toHaveLength(3);
    expect(writes).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText('Vontade antes'), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText('Prazer'), { target: { value: '7' } });
    fireEvent.change(within(dialog).getByLabelText('Realização'), { target: { value: '8' } });
    await user.type(within(dialog).getByLabelText('Quer anotar algo? (opcional)'), 'Foi bom.');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]?.body).toEqual({
      status: 'CONCLUIDA',
      name: 'Caminhada',
      activityDate: '2026-09-23',
      wantBefore: 2,
      pleasure: 7,
      achievement: 8,
      observation: 'Foi bom.',
    });
  });

  it('"Já fiz" em dia futuro é recusado antes de enviar', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByLabelText('O que você vai fazer (ou fez)?'), 'Caminhada');
    fireEvent.change(within(dialog).getByLabelText('Dia'), { target: { value: '2026-09-25' } });
    await user.click(within(dialog).getByRole('radio', { name: /Já fiz/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(within(dialog).getByText(/Esse dia ainda não chegou/)).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('"Não aconteceu": cria planejada e marca em seguida, com a observação', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.type(within(dialog).getByLabelText('O que você vai fazer (ou fez)?'), 'Academia');
    await user.click(within(dialog).getByRole('radio', { name: /Não aconteceu/ }));
    await user.type(within(dialog).getByLabelText('Quer anotar algo? (opcional)'), 'Fiquei sem energia.');
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toMatchObject({ path: '/activities', body: { status: 'PLANEJADA', name: 'Academia' } });
    expect(writes[1]?.path).toMatch(/\/activities\/.+\/not-done$/);
    expect(writes[1]?.body).toEqual({ observation: 'Fiquei sem energia.' });
  });

  it('nome vazio não envia', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(within(dialog).getByText('Dê um nome para a atividade.')).toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });

  it('o "+" de um dia abre o formulário já com aquela data', async () => {
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(await screen.findByRole('button', { name: /Adicionar atividade em segunda-feira, 21\/09/ }));

    expect(within(screen.getByRole('dialog')).getByLabelText('Dia')).toHaveValue('2026-09-21');
  });

  it('Cancelar fecha sem enviar', async () => {
    const writes = recordWrites();
    const { user, dialog } = await openCreate();

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(writes).toHaveLength(0);
  });
});

describe('RecordsPage: transições', () => {
  it('"Conta como foi?" numa PLANEJADA registra a vontade e depois conclui', async () => {
    const activity = fakeActivity({ name: 'Caminhada', status: 'PLANEJADA' });
    weekHandler([activity]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Caminhada')).getByRole('button', { name: 'Conta como foi?' }));
    const dialog = screen.getByRole('dialog', { name: 'Conta como foi?' });
    fireEvent.change(within(dialog).getByLabelText('Vontade antes de fazer'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText('Prazer'), { target: { value: '6' } });
    fireEvent.change(within(dialog).getByLabelText('Realização'), { target: { value: '9' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[0]).toEqual({ method: 'POST', path: `/activities/${activity.id}/start`, body: { wantBefore: 3 } });
    expect(writes[1]).toEqual({
      method: 'POST',
      path: `/activities/${activity.id}/complete`,
      body: { pleasure: 6, achievement: 9 },
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('se só o primeiro passo gravar, fecha o formulário e avisa na tela', async () => {
    weekHandler([fakeActivity({ name: 'Caminhada', status: 'PLANEJADA' })]);
    recordWrites({ 'POST /activities/:id/complete': () => new HttpResponse(null, { status: 500 }) });
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Caminhada')).getByRole('button', { name: 'Conta como foi?' }));
    const dialog = screen.getByRole('dialog');
    for (const [label, value] of [
      ['Vontade antes de fazer', '3'],
      ['Prazer', '6'],
      ['Realização', '9'],
    ] as const) {
      fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
    }
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Salvamos a vontade, mas não deu para concluir. Tente de novo pelo card.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('registra a vontade de uma PLANEJADA', async () => {
    const activity = fakeActivity({ name: 'Cinema', status: 'PLANEJADA', activityDate: '2026-09-26' });
    weekHandler([activity]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Cinema')).getByRole('button', { name: 'Registrar vontade' }));
    const dialog = screen.getByRole('dialog', { name: 'Quanta vontade você tem agora?' });
    fireEvent.change(within(dialog).getByLabelText('Vontade antes'), { target: { value: '0' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([
        { method: 'POST', path: `/activities/${activity.id}/start`, body: { wantBefore: 0 } },
      ]),
    );
  });

  it('"Não aconteceu" com texto acolhedor e observação opcional', async () => {
    const activity = fakeActivity({ name: 'Academia', status: 'PENDENTE', wantBefore: 2 });
    weekHandler([activity]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Academia')).getByRole('button', { name: 'Não aconteceu' }));
    const dialog = screen.getByRole('dialog', { name: 'Tudo bem, quer contar o que aconteceu?' });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'POST', path: `/activities/${activity.id}/not-done`, body: {} }]),
    );
  });

  it('mostra no formulário o erro que a API devolver (ex.: 409)', async () => {
    weekHandler([fakeActivity({ name: 'Caminhada', status: 'PENDENTE', wantBefore: 4 })]);
    recordWrites({
      'POST /activities/:id/complete': () =>
        apiError(409, 'ACTIVITY_FINALIZED', 'Esta atividade já foi finalizada e não pode mais ser alterada.'),
    });
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Caminhada')).getByRole('button', { name: 'Conta como foi?' }));
    const dialog = screen.getByRole('dialog');
    // O polegar começa no 5 (sem valor escolhido): outro valor para o change disparar.
    fireEvent.change(within(dialog).getByLabelText('Prazer'), { target: { value: '4' } });
    fireEvent.change(within(dialog).getByLabelText('Realização'), { target: { value: '6' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('já foi finalizada');
  });
});

describe('RecordsPage: editar e excluir', () => {
  it('edita só o que mudou', async () => {
    const activity = fakeActivity({ name: 'Caminhada', status: 'PENDENTE', wantBefore: 4 });
    weekHandler([activity]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Caminhada')).getByRole('button', { name: 'Editar' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar atividade' });
    fireEvent.change(within(dialog).getByLabelText('Vontade antes'), { target: { value: '7' } });
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'PATCH', path: `/activities/${activity.id}`, body: { wantBefore: 7 } }]),
    );
  });

  it('excluir pede confirmação', async () => {
    const activity = fakeActivity({ name: 'Caminhada' });
    weekHandler([activity]);
    const writes = recordWrites();
    const user = userEvent.setup();
    renderRoute('/registros');

    await user.click(within(await findCard('Caminhada')).getByRole('button', { name: 'Excluir' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir “Caminhada”?' });
    expect(writes).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(writes).toEqual([{ method: 'DELETE', path: `/activities/${activity.id}`, body: undefined }]),
    );
  });
});

describe('RecordsPage: ciclo da consulta (DEC-050)', () => {
  // Consulta na segunda, 28/09, às 14:00; a anterior foi na segunda, 21/09.
  const cycle = {
    from: '2026-09-22',
    to: '2026-09-28',
    session: { date: '2026-09-28', time: '14:00', kind: 'RECORRENTE' },
    truncated: false,
    previous: '2026-09-21',
    next: '2026-09-29',
  };

  function cycleHandler() {
    const dates: (string | null)[] = [];
    server.use(
      http.get('*/api/appointments/cycle', ({ request }) => {
        dates.push(new URL(request.url).searchParams.get('date'));
        return HttpResponse.json({ today: '2026-09-24', cycle });
      }),
    );
    return dates;
  }

  it('abre no ciclo de hoje: título, período, contagem, resumo e as atividades do ciclo', async () => {
    cycleHandler();
    const calls = weekHandler([
      fakeActivity({ name: 'Caminhada', activityDate: '2026-09-23', status: 'CONCLUIDA', wantBefore: 2, pleasure: 7, achievement: 8 }),
    ]);
    renderRoute('/registros');

    expect(await screen.findByRole('heading', { name: 'Consulta de 28/09' })).toBeInTheDocument();
    expect(screen.getByText('22/09 a 28/09')).toBeInTheDocument();
    expect(screen.getByText('Sua consulta é daqui a 4 dias.')).toBeInTheDocument();
    expect(await screen.findByText(/^7 dias · 1 atividade feita/)).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 3, name: /segunda-feira, 28\/09/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /segunda-feira, 21\/09/ })).not.toBeInTheDocument();
    await waitFor(() => expect(calls).toContainEqual({ from: '2026-09-22', to: '2026-09-28' }));
  });

  it('setas e alternância ficam na URL, e trocar de aba mantém o período', async () => {
    const dates = cycleHandler();
    weekHandler([]);
    const user = userEvent.setup();
    const { router } = renderRoute('/registros');

    await user.click(await screen.findByRole('button', { name: 'Ciclo anterior' }));
    await waitFor(() => expect(router.state.location.search).toBe('?ciclo=2026-09-21'));
    await waitFor(() => expect(dates.at(-1)).toBe('2026-09-21'));

    await user.click(screen.getByRole('link', { name: 'Pensamentos' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/pensamentos'));
    expect(router.state.location.search).toBe('?ciclo=2026-09-21');

    await user.click(screen.getByRole('link', { name: 'Atividades' }));
    await user.click(await screen.findByRole('button', { name: 'Semana' }));
    expect(await screen.findByRole('heading', { name: '21 a 27 de set.' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?semana=2026-09-21');
    await user.click(screen.getByRole('button', { name: 'Ciclo' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });
});
