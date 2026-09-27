import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { apiError, server } from '../test/server';

// Telas abertas pelos links dos e-mails: confirmar e-mail e redefinir senha,
// além do pedido de "esqueci a senha".

describe('ConfirmEmailPage', () => {
  it('confirma uma única vez e tira o token da barra de endereço', async () => {
    const received: unknown[] = [];
    server.use(
      http.post('*/api/auth/confirm-email', async ({ request }) => {
        received.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute('/confirmar-email?token=token-ficticio');

    expect(await screen.findByRole('heading', { name: 'E-mail confirmado' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/entrar');
    expect(received).toEqual([{ token: 'token-ficticio' }]);
    expect(router.state.location.search).toBe('');
  });

  it('link usado ou expirado: explica com calma o que fazer', async () => {
    server.use(
      http.post('*/api/auth/confirm-email', () =>
        apiError(400, 'INVALID_TOKEN', 'Este link é inválido, já foi usado ou expirou.'),
      ),
    );
    renderRoute('/confirmar-email?token=token-usado');

    expect(await screen.findByRole('alert')).toHaveTextContent(/já foi usado ou expirou/);
  });

  it('sem token no endereço, não chama a API', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/confirm-email', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/confirmar-email');

    expect(screen.getByRole('heading', { name: 'Link incompleto' })).toBeInTheDocument();
    expect(called).toBe(false);
  });
});

describe('ForgotPasswordPage', () => {
  it('responde de forma neutra depois de pedir o link', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/forgot-password', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/esqueci-a-senha');

    await user.type(await screen.findByLabelText('E-mail'), 'ana@faisca.test');
    await user.click(screen.getByRole('button', { name: 'Enviar link' }));

    expect(await screen.findByText(/Se houver uma conta com esse e-mail/)).toBeInTheDocument();
    expect(body).toEqual({ email: 'ana@faisca.test' });
  });
});

describe('ResetPasswordPage', () => {
  async function fill(password: string, confirmation: string) {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Nova senha'), password);
    await user.type(screen.getByLabelText('Repita a nova senha'), confirmation);
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
  }

  it('salva a senha nova com o token do link', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/reset-password', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute('/redefinir-senha?token=token-ficticio');

    await waitFor(() => expect(router.state.location.search).toBe(''));
    await fill('nova-senha-ficticia', 'nova-senha-ficticia');

    expect(await screen.findByRole('heading', { name: 'Senha nova criada' })).toBeInTheDocument();
    expect(body).toEqual({ token: 'token-ficticio', password: 'nova-senha-ficticia' });
  });

  it('avisa quando as duas senhas são diferentes', async () => {
    renderRoute('/redefinir-senha?token=token-ficticio');

    await fill('nova-senha-ficticia', 'outra-senha-ficticia');

    expect(screen.getByLabelText('Repita a nova senha')).toHaveAccessibleDescription(
      'As duas senhas não estão iguais.',
    );
  });

  it('link usado ou expirado: oferece pedir um novo', async () => {
    server.use(
      http.post('*/api/auth/reset-password', () =>
        apiError(400, 'INVALID_TOKEN', 'Este link é inválido, já foi usado ou expirou.'),
      ),
    );
    renderRoute('/redefinir-senha?token=token-usado');

    await fill('nova-senha-ficticia', 'nova-senha-ficticia');

    expect(await screen.findByRole('link', { name: 'Peça um link novo' })).toHaveAttribute(
      'href',
      '/esqueci-a-senha',
    );
  });
});
