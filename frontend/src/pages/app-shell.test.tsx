import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../app/theme-context';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('telas de quem entrou', () => {
  it('sem sessão, manda para a tela de entrar', async () => {
    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('paciente: o início leva aos registros e cumprimenta pelo primeiro nome', async () => {
    server.use(loggedIn);
    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/registros');
    // Um perfil só: sem alternância entre perfis.
    expect(screen.queryByRole('navigation', { name: 'Perfis' })).not.toBeInTheDocument();
  });

  it('só terapeuta: o início leva aos pacientes, e os registros não abrem', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: false, therapist: true } } }),
      ),
    );
    const { router } = renderRoute('/registros');

    expect(await screen.findByRole('heading', { name: 'Meus pacientes' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/pacientes');
  });

  it('só paciente: a tela de pacientes não abre', async () => {
    server.use(loggedIn);
    const { router } = renderRoute('/pacientes');

    await waitFor(() => expect(router.state.location.pathname).toBe('/registros'));
  });

  it('dois perfis: alterna entre "Meus registros" e "Meus pacientes"', async () => {
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json({ user: { ...fakeUser, profiles: { patient: true, therapist: true } } }),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    const nav = await screen.findByRole('navigation', { name: 'Perfis' });
    await user.click(within(nav).getByRole('link', { name: 'Meus pacientes' }));
    expect(router.state.location.pathname).toBe('/pacientes');

    await user.click(within(nav).getByRole('link', { name: 'Meus registros' }));
    expect(router.state.location.pathname).toBe('/registros');
  });

  it('sair encerra a sessão e volta para a tela de entrar', async () => {
    let loggedOut = false;
    server.use(
      http.get('*/api/auth/me', () =>
        loggedOut
          ? HttpResponse.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
          : HttpResponse.json({ user: fakeUser }),
      ),
      http.post('*/api/auth/logout', () => {
        loggedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderRoute('/');

    await user.click(await screen.findByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
    expect(loggedOut).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
  });

  it('mostra uma mensagem calma quando não consegue checar a sessão', async () => {
    server.use(http.get('*/api/auth/me', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/');

    expect(
      await screen.findByRole('heading', { name: 'Não conseguimos abrir o Faísca agora' }),
    ).toBeInTheDocument();
  });

  it('troca e guarda o tema escolhido', async () => {
    server.use(loggedIn);
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(await screen.findByRole('radio', { name: 'Escuro' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    await user.click(screen.getByRole('radio', { name: 'Automático' }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });
});

describe('rota inexistente', () => {
  it('mostra a página 404', () => {
    renderRoute('/nao-existe');

    expect(screen.getByRole('heading', { name: 'Essa página não existe' })).toBeInTheDocument();
  });
});
