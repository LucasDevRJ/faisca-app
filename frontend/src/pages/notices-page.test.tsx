import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PatientNotice } from '../features/notices/notices-api';
import { renderRoute } from '../test/render';
import { loggedIn, server } from '../test/server';

// Avisos de quem acompanha, do lado do paciente (DEC-079, DEC-080). Dados fictícios (regra 5).
const therapist = { name: 'Tereza Fictícia', email: 'tereza@faisca.test', avatarVersion: null };
const linked = {
  link: { id: 'l1', method: 'CODE', createdAt: '2026-09-28T15:00:00Z', seen: true, therapist },
  invite: null,
  code: null,
};

beforeEach(() => {
  server.use(loggedIn);
});

function notice(n: number, overrides: Partial<PatientNotice> = {}): PatientNotice {
  return {
    id: `00000000-0000-4000-d000-00000000000${n}`,
    body: `Aviso fictício ${n}`,
    createdAt: `2026-10-2${n}T15:00:00.000Z`,
    updatedAt: `2026-10-2${n}T15:00:00.000Z`,
    seen: true,
    ...overrides,
  };
}

function noticesApi(notices: PatientNotice[], { withLink = true } = {}) {
  const seenCalls: unknown[] = [];
  let current = notices;
  server.use(
    http.get('*/api/link', () => HttpResponse.json(withLink ? linked : { link: null, invite: null, code: null })),
    http.get('*/api/notices', () =>
      HttpResponse.json({ notices: current, unseenCount: current.filter((n) => !n.seen).length }),
    ),
    http.put('*/api/notices/seen', async ({ request }) => {
      const { ids } = (await request.json()) as { ids: string[] };
      seenCalls.push(ids);
      current = current.map((n) => (ids.includes(n.id) ? { ...n, seen: true } : n));
      return HttpResponse.json({ notices: current, unseenCount: 0 });
    }),
  );
  return seenCalls;
}

describe('cartão dos avisos em Meus registros', () => {
  it('mostra o aviso mais recente, com o nome de quem acompanha e o selo "Novo"', async () => {
    noticesApi([notice(2, { seen: false, body: 'Feriado na segunda.' }), notice(1)]);
    const user = userEvent.setup();
    const { router } = renderRoute('/registros');

    const card = await screen.findByRole('region', { name: 'Avisos de Tereza Fictícia' });
    expect(card).toHaveTextContent('Feriado na segunda.');
    expect(within(card).getByText('Novo')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Aviso fictício 1');

    await user.click(within(card).getByRole('link', { name: 'Ver avisos' }));
    expect(router.state.location.pathname).toBe('/avisos');
  });

  it('sem avisos, o cartão não aparece', async () => {
    noticesApi([]);
    renderRoute('/registros');

    expect(await screen.findByRole('heading', { level: 1, name: /Olá/ })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Avisos/ })).not.toBeInTheDocument();
  });
});

describe('/avisos (paciente)', () => {
  it('lista do mais novo para o mais antigo; marca os novos uma vez e o selo fica durante a visita', async () => {
    const seenCalls = noticesApi([
      notice(3, { seen: false }),
      notice(2, { updatedAt: '2026-10-24T15:00:00.000Z' }),
      notice(1, { seen: false }),
    ]);
    renderRoute('/avisos');

    expect(await screen.findByRole('heading', { level: 1, name: 'Avisos de Tereza Fictícia' })).toBeInTheDocument();
    const items = await screen.findAllByRole('article');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'Aviso de 23/10/2026',
      'Aviso de 22/10/2026',
      'Aviso de 21/10/2026',
    ]);
    expect(items[1]).toHaveTextContent('editado em 24/10/2026');

    await waitFor(() => expect(seenCalls).toEqual([[notice(3).id, notice(1).id]]));
    // O selo continua nesta visita.
    expect(within(items[0]!).getByText('Novo')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Novo')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('Novo')).not.toBeInTheDocument();
  });

  it('tudo já visto: não chama a API do "já vi"', async () => {
    const seenCalls = noticesApi([notice(1)]);
    renderRoute('/avisos');

    expect(await screen.findByRole('article', { name: 'Aviso de 21/10/2026' })).toBeInTheDocument();
    expect(seenCalls).toEqual([]);
  });

  it('sem vínculo: texto neutro', async () => {
    noticesApi([], { withLink: false });
    renderRoute('/avisos');

    expect(
      await screen.findByText('Quando alguém acompanhar seus registros, os avisos dessa pessoa aparecem aqui.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Avisos' })).toBeInTheDocument();
  });
});
