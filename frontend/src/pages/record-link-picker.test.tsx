import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../features/activities/activities-api';
import { renderRoute } from '../test/render';
import { fakeActivity, loggedIn, server } from '../test/server';

// Seletor de ligações (#260): janela de 4 semanas (sem agenda), filtros, busca e lista de cartões.
// "Hoje" fixo: quinta, 24/09/2026.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-24T18:00:00Z'));
  server.use(loggedIn);
});
afterEach(() => vi.useRealTimers());

const THOUGHT = '00000000-0000-4000-9000-000000000091';
const ACTION = '00000000-0000-4000-9000-000000000092';
const LINKED = '00000000-0000-4000-9000-000000000093';

function setup(activities: Activity[]) {
  const candidateCalls: { from: string | null; to: string | null }[] = [];
  const searches: unknown[] = [];
  const posts: unknown[] = [];
  server.use(
    http.get('*/api/activities', ({ request }) => {
      const url = new URL(request.url);
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      return HttpResponse.json({ activities: activities.filter((a) => a.activityDate >= from && a.activityDate <= to) });
    }),
    http.get('*/api/record-links/candidates', ({ request }) => {
      const url = new URL(request.url);
      candidateCalls.push({ from: url.searchParams.get('from'), to: url.searchParams.get('to') });
      return HttpResponse.json({ records: [
        { type: 'THOUGHT_RECORD', id: THOUGHT, date: '2026-09-22', title: 'Achei que ia dar tudo errado na reunião' },
        { type: 'ACTION', id: ACTION, date: '2026-09-08', title: 'Caminhar 20 minutos no parque' },
        { type: 'ACTIVITY', id: LINKED, date: '2026-09-21', title: 'Já ligada' },
      ] });
    }),
    http.get('*/api/record-links', () => HttpResponse.json({ links: [{
      id: '00000000-0000-4000-9000-000000000094', kind: 'RELATED',
      source: { type: 'ACTIVITY', id: activities[0]!.id, date: activities[0]!.activityDate, title: activities[0]!.name },
      target: { type: 'ACTIVITY', id: LINKED, date: '2026-09-21', title: 'Já ligada' },
    }] })),
    http.post('*/api/records/search', async ({ request }) => {
      searches.push(await request.json());
      return HttpResponse.json({ results: [{
        id: ACTION, type: 'ACTION', date: '2026-03-02', title: 'Caminhar', titleMatch: null, excerpt: 'Café com a Ana depois do trabalho', excerptField: 'observation',
        matchStart: 0, matchLength: 4, content: {},
      }], page: 1, pageSize: 20, total: 1, hasMore: false });
    }),
    http.post('*/api/record-links', async ({ request }) => {
      posts.push(await request.json());
      return HttpResponse.json({ link: {} }, { status: 201 });
    }),
  );
  return { candidateCalls, searches, posts };
}

async function openPicker(name: string) {
  const user = userEvent.setup();
  renderRoute('/registros');
  const card = await screen.findByRole('article', { name });
  await user.click(within(card).getByRole('button', { name: 'Ligar a outro registro' }));
  return { user, card };
}

describe('seletor de ligações', () => {
  it('mostra 4 semanas em cartões agrupados, sem os já ligados, e liga o escolhido', async () => {
    const activity = fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' });
    const { candidateCalls, posts } = setup([activity]);
    const { user, card } = await openPicker('Caminhada');

    expect(await within(card).findByText('Semanas de 31/08 a 27/09')).toBeInTheDocument();
    expect(candidateCalls).toContainEqual({ from: '2026-08-31', to: '2026-09-27' });
    expect(within(card).getByRole('heading', { name: 'Semana de 21/09 a 27/09' })).toBeInTheDocument();
    expect(within(card).getByRole('heading', { name: 'Semana de 07/09 a 13/09' })).toBeInTheDocument();
    expect(within(card).queryByText('Já ligada', { selector: 'label *' })).not.toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Semanas seguintes' })).toBeDisabled();

    const ligar = within(card).getByRole('button', { name: 'Ligar' });
    expect(ligar).toBeDisabled();
    await user.click(within(card).getByRole('radio', { name: /Achei que ia dar tudo errado/ }));
    await user.click(ligar);
    await waitFor(() => expect(posts).toEqual([{ sourceType: 'ACTIVITY', sourceId: activity.id, targetType: 'THOUGHT_RECORD', targetId: THOUGHT }]));
  });

  it('filtra por tipo e volta 4 semanas com a seta', async () => {
    const { candidateCalls } = setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    const { user, card } = await openPicker('Caminhada');
    await within(card).findByRole('radio', { name: /Achei que ia dar/ });

    await user.click(within(card).getByRole('button', { name: 'Ação' }));
    expect(within(card).getByRole('button', { name: 'Ação' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).queryByRole('radio', { name: /Achei que ia dar/ })).not.toBeInTheDocument();
    expect(within(card).getByRole('radio', { name: /Caminhar 20 minutos/ })).toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Semanas anteriores' }));
    expect(await within(card).findByText('Semanas de 03/08 a 30/08')).toBeInTheDocument();
    expect(candidateCalls).toContainEqual({ from: '2026-08-03', to: '2026-08-30' });
    expect(within(card).getByRole('button', { name: 'Semanas seguintes' })).toBeEnabled();
  });

  it('a busca vai no corpo do POST, nos últimos 12 meses, e mostra o trecho encontrado', async () => {
    const { searches } = setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    const { user, card } = await openPicker('Caminhada');

    await user.type(within(card).getByRole('searchbox', { name: 'Buscar no texto' }), 'café');
    await user.click(within(card).getByRole('button', { name: 'Buscar' }));

    expect(await within(card).findByRole('radio', { name: /Café com a Ana/ })).toBeInTheDocument();
    expect(within(card).getByText('Café', { selector: 'mark' })).toBeInTheDocument();
    // Título e trecho em linhas separadas (#305).
    expect(within(card).getByText('Caminhar')).toBeInTheDocument();
    expect(within(card).getByText(/com a Ana depois do trabalho/)).toHaveClass('text-muted');
    expect(searches[0]).toMatchObject({ term: 'café', from: '2025-09-24', to: '2026-09-24', page: 1 });
    expect((searches[0] as { types: string[] }).types).not.toContain('ABOUT_ME');
    expect(within(card).queryByRole('button', { name: 'Semanas anteriores' })).not.toBeInTheDocument();

    await user.click(within(card).getByRole('button', { name: 'Limpar busca' }));
    expect(await within(card).findByRole('button', { name: 'Semanas anteriores' })).toBeInTheDocument();
  });

  it('palavra só no título: o cartão mostra o título realçado, sem trecho vazio (#305)', async () => {
    setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    server.use(http.post('*/api/records/search', () => HttpResponse.json({ results: [{
      id: THOUGHT, type: 'THOUGHT_RECORD', date: '2026-09-20', title: 'Ninguém vai gostar de mim', titleMatch: { start: 12, length: 6 },
      excerpt: '', excerptField: null, matchStart: 0, matchLength: 0, content: {},
    }], page: 1, pageSize: 20, total: 1, hasMore: false })));
    const { user, card } = await openPicker('Caminhada');

    await user.type(within(card).getByRole('searchbox', { name: 'Buscar no texto' }), 'gostar');
    await user.click(within(card).getByRole('button', { name: 'Buscar' }));

    expect(await within(card).findByRole('radio', { name: /Ninguém vai gostar de mim/ })).toBeInTheDocument();
    expect(within(card).getByText('gostar', { selector: 'mark' })).toBeInTheDocument();
  });

  it('busca sem resultado avisa sem culpa', async () => {
    setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    server.use(http.post('*/api/records/search', () => HttpResponse.json({ results: [], page: 1, pageSize: 20, total: 0, hasMore: false })));
    const { user, card } = await openPicker('Caminhada');
    await user.type(within(card).getByRole('searchbox', { name: 'Buscar no texto' }), 'xyz');
    await user.click(within(card).getByRole('button', { name: 'Buscar' }));
    expect(await within(card).findByText('Nada encontrado com essa palavra nos últimos 12 meses.')).toBeInTheDocument();
  });

  it('o foco entra no seletor ao abrir e volta ao botão ao cancelar ou ligar', async () => {
    const activity = fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' });
    setup([activity]);
    const { user, card } = await openPicker('Caminhada');
    expect(within(card).getByRole('button', { name: 'Todos' })).toHaveFocus();

    await user.click(within(card).getByRole('button', { name: 'Cancelar' }));
    expect(within(card).getByRole('button', { name: 'Ligar a outro registro' })).toHaveFocus();

    await user.click(within(card).getByRole('button', { name: 'Ligar a outro registro' }));
    await user.click(await within(card).findByRole('radio', { name: /Achei que ia dar/ }));
    await user.click(within(card).getByRole('button', { name: 'Ligar' }));
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Ligar a outro registro' })).toHaveFocus());
  });

  it('"Ir para uma data" leva a janela até a semana daquele dia', async () => {
    const { candidateCalls } = setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    const { user, card } = await openPicker('Caminhada');
    await within(card).findByText('Semanas de 31/08 a 27/09');

    await user.type(within(card).getByLabelText('Ir para uma data'), '2026-06-10');
    await user.click(within(card).getByRole('button', { name: 'Ir' }));
    expect(await within(card).findByText('Semanas de 18/05 a 14/06')).toBeInTheDocument();
    expect(candidateCalls).toContainEqual({ from: '2026-05-18', to: '2026-06-14' });
  });

  it('erro ao buscar os registros: avisa e não quebra a tela', async () => {
    setup([fakeActivity({ name: 'Caminhada', activityDate: '2026-09-24' })]);
    server.use(http.get('*/api/record-links/candidates', () => HttpResponse.json({ error: { code: 'X', message: 'x' } }, { status: 500 })));
    const { card } = await openPicker('Caminhada');
    expect(await within(card).findByRole('alert')).toHaveTextContent('Não foi possível buscar outros registros.');
    expect(within(card).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });
});
