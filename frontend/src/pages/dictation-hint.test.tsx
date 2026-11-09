import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ACCESSIBILITY } from '../features/profile/accessibility';
import { renderRoute } from '../test/render';
import { fakeUser, loggedIn, server } from '../test/server';

// "Prefere falar?" (#154): a frase do microfone do teclado nos formulários de texto longo.
// Só aparece em tela de toque (classe pointer-coarse); aqui, sem CSS, confere o texto.
const HINT = 'Prefere falar? Use o microfone do teclado do celular.';

beforeEach(() => {
  server.use(loggedIn);
});

describe('dica do microfone do teclado', () => {
  it('aparece no novo Registro de Pensamentos e no novo episódio de tensão', async () => {
    const first = renderRoute('/pensamentos/novo');
    expect(await screen.findByText(HINT)).toBeInTheDocument();
    first.unmount();

    renderRoute('/tensao/novo');
    expect(await screen.findByText(HINT)).toBeInTheDocument();
  });

  it('com Linguagem direta, o texto fica literal', async () => {
    const accessibility = { ...DEFAULT_ACCESSIBILITY, directLanguage: true };
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, accessibility } })));
    renderRoute('/pensamentos/novo');

    expect(await screen.findByText('Para ditar em vez de digitar, use o microfone do teclado do celular.')).toBeInTheDocument();
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
