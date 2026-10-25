import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_TEXTS } from '../features/announcements/announcement-texts';
import { renderRoute } from '../test/render';
import { fakeUser, server } from '../test/server';

// "O que há de novo" (DEC-060). Duas novidades fictícias a mais, só para o teste: uma mais nova
// para todos e uma só para terapeutas.
const ALTERNATIVE = '2026-10-explicacao-alternativa';
const NEWER = 'teste-mais-nova';
const THERAPIST_ONLY = 'teste-so-terapeuta';

beforeEach(() => {
  ANNOUNCEMENT_TEXTS[NEWER] = {
    title: 'Novidade fictícia mais nova',
    date: '2026-10-30',
    patient: <p>Texto fictício para pacientes.</p>,
    therapist: <p>Texto fictício para terapeutas.</p>,
  };
  ANNOUNCEMENT_TEXTS[THERAPIST_ONLY] = {
    title: 'Novidade fictícia da terapeuta',
    date: '2026-10-18',
    therapist: <p>Só para quem atende.</p>,
  };
});

afterEach(() => {
  delete ANNOUNCEMENT_TEXTS[NEWER];
  delete ANNOUNCEMENT_TEXTS[THERAPIST_ONLY];
});

function session(profiles: { patient: boolean; therapist: boolean }, pendingAnnouncement: string | null = null) {
  const seen: unknown[] = [];
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, profiles, pendingAnnouncement } })),
    http.post('*/api/auth/announcement-seen', async ({ request }) => {
      seen.push(await request.json());
      return HttpResponse.json({ user: { ...fakeUser, profiles, pendingAnnouncement: null } });
    }),
  );
  return seen;
}

const patientOnly = { patient: true, therapist: false };
const therapistOnly = { patient: false, therapist: true };

describe('página "O que há de novo"', () => {
  it('lista as novidades da mais nova para a mais antiga, com a data e o texto do perfil', async () => {
    session(patientOnly);
    renderRoute('/novidades');

    expect(await screen.findByRole('heading', { level: 1, name: 'O que há de novo' })).toBeInTheDocument();
    const entries = screen.getAllByRole('article');
    expect(entries.map((entry) => within(entry).getByRole('heading').textContent)).toEqual([
      'Novidade fictícia mais nova',
      'Novidade: fotos na Ação',
      'Novidade no Registro de Pensamentos',
    ]);
    expect(within(entries[0]!).getByText('30 de outubro de 2026')).toBeInTheDocument();
    expect(within(entries[0]!).getByText('Texto fictício para pacientes.')).toBeInTheDocument();
    expect(within(entries[0]!).queryByText('Texto fictício para terapeutas.')).not.toBeInTheDocument();
    expect(within(entries[2]!).getByRole('link', { name: 'Ver meus pensamentos' })).toHaveAttribute(
      'href',
      '/pensamentos',
    );
  });

  it('a novidade só da terapeuta aparece para ela e não para a paciente', async () => {
    session(therapistOnly);
    const first = renderRoute('/novidades');
    expect(await screen.findByRole('article', { name: 'Novidade fictícia da terapeuta' })).toBeInTheDocument();
    // Sem perfil de paciente, nenhum atalho de paciente.
    expect(screen.queryByRole('link', { name: 'Ver meus pensamentos' })).not.toBeInTheDocument();
    first.unmount();

    session(patientOnly);
    renderRoute('/novidades');
    await screen.findByRole('article', { name: 'Novidade fictícia mais nova' });
    expect(screen.queryByRole('article', { name: 'Novidade fictícia da terapeuta' })).not.toBeInTheDocument();
  });

  it('a novidade ainda não fechada tem o selo "Nova" e o "Entendi"; abrir a página não fecha nada', async () => {
    const seen = session(patientOnly, ALTERNATIVE);
    const user = userEvent.setup();
    renderRoute('/novidades');

    const entry = await screen.findByRole('article', { name: 'Novidade no Registro de Pensamentos' });
    expect(within(entry).getByText('Nova')).toBeInTheDocument();
    const other = screen.getByRole('article', { name: 'Novidade fictícia mais nova' });
    expect(within(other).queryByText('Nova')).toBeNull();
    expect(within(other).queryByRole('button', { name: 'Entendi' })).toBeNull();
    // Sem o card repetido no topo: a pendente já está na lista.
    expect(screen.queryByRole('region', { name: /Novidade/ })).not.toBeInTheDocument();
    expect(seen).toEqual([]);

    await user.click(within(entry).getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(seen).toEqual([{ announcement: ALTERNATIVE }]));
    await waitFor(() => expect(within(entry).queryByText('Nova')).not.toBeInTheDocument());
  });

  it('/novidades#<id> abre direto naquela novidade', async () => {
    session(patientOnly);
    renderRoute(`/novidades#${ALTERNATIVE}`);

    const entry = await screen.findByRole('article', { name: 'Novidade no Registro de Pensamentos' });
    await waitFor(() => expect(entry).toHaveFocus());
  });

  it('sem sessão, o link com # volta para a novidade certa depois do login', async () => {
    const { router } = renderRoute(`/novidades#${ALTERNATIVE}`);

    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe(`/novidades#${ALTERNATIVE}`);
  });
});

describe('caminhos até a página', () => {
  it('pela Conta', async () => {
    session(patientOnly);
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');

    await user.click(await screen.findByRole('link', { name: 'Ver o que há de novo' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/novidades'));
  });

  it('pelo card de Novidades, sem marcar como vista', async () => {
    const seen = session(patientOnly, ALTERNATIVE);
    const user = userEvent.setup();
    const { router } = renderRoute('/conta');

    const card = await screen.findByRole('region', { name: 'Novidade no Registro de Pensamentos' });
    await user.click(within(card).getByRole('link', { name: 'Ver todas as novidades' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/novidades'));
    expect(seen).toEqual([]);
  });
});
