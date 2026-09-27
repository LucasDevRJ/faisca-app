import { screen, waitFor } from '@testing-library/react';
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

describe('HomePage', () => {
  it('sem sessão, manda para a tela de entrar', async () => {
    const { router } = renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
  });

  it('com sessão, cumprimenta pelo primeiro nome', async () => {
    server.use(loggedIn);
    renderRoute('/');

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument();
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
