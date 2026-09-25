import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY } from '../app/theme-context';
import { renderRoute } from '../test/render';
import { server } from '../test/server';

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe('HomePage', () => {
  it('mostra que está conectada quando a API responde', async () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Faísca');
    expect(await screen.findByText('Conectado à API.')).toBeInTheDocument();
  });

  it('mostra uma mensagem calma quando a API falha', async () => {
    server.use(http.get('*/api/health', () => new HttpResponse(null, { status: 500 })));
    renderRoute('/');

    expect(await screen.findByText('Não foi possível falar com a API agora.')).toBeInTheDocument();
  });

  it('troca e guarda o tema escolhido', async () => {
    const user = userEvent.setup();
    renderRoute('/');

    await user.click(screen.getByRole('radio', { name: 'Escuro' }));
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
