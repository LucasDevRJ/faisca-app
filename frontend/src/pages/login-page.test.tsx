import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

async function fillAndSubmit(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('E-mail'), email);
  await user.type(screen.getByLabelText('Senha'), password);
  await user.click(screen.getByRole('button', { name: 'Entrar' }));
  return user;
}

describe('LoginPage', () => {
  it('entra e vai para a tela inicial', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/login', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ user: fakeUser });
      }),
    );
    const { router } = renderRoute('/entrar');

    await fillAndSubmit('  ana@faisca.test ', 'senha-ficticia-123');

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(body).toEqual({ email: 'ana@faisca.test', password: 'senha-ficticia-123' });
  });

  it('volta para a página pedida antes do login (?next=)', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json({ user: fakeUser })));
    const { router } = renderRoute('/entrar?next=%2Fnao-existe');

    await fillAndSubmit('ana@faisca.test', 'senha-ficticia-123');

    await waitFor(() => expect(router.state.location.pathname).toBe('/nao-existe'));
  });

  it('ignora ?next= que aponta para outro site', async () => {
    server.use(http.post('*/api/auth/login', () => HttpResponse.json({ user: fakeUser })));
    const { router } = renderRoute('/entrar?next=%2F%2Fsite-malicioso.test');

    await fillAndSubmit('ana@faisca.test', 'senha-ficticia-123');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('mostra a mensagem da API quando a senha não confere', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        apiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha não conferem.'),
      ),
    );
    renderRoute('/entrar');

    await fillAndSubmit('ana@faisca.test', 'errada-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha não conferem.');
  });

  it('com e-mail não confirmado, oferece reenviar a confirmação', async () => {
    let resentTo: unknown;
    server.use(
      http.post('*/api/auth/login', () =>
        apiError(403, 'EMAIL_NOT_CONFIRMED', 'Falta confirmar seu e-mail.'),
      ),
      http.post('*/api/auth/resend-confirmation', async ({ request }) => {
        resentTo = ((await request.json()) as { email: string }).email;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/entrar');

    const user = await fillAndSubmit('ana@faisca.test', 'senha-ficticia-123');
    await user.click(await screen.findByRole('button', { name: 'Reenviar e-mail de confirmação' }));

    expect(await screen.findByText(/Enviamos um novo link/)).toBeInTheDocument();
    expect(resentTo).toBe('ana@faisca.test');
  });

  it('valida os campos antes de enviar', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/login', () => {
        called = true;
        return HttpResponse.json({ user: fakeUser });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/entrar');

    await user.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe seu e-mail.');
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Informe sua senha.');
    expect(called).toBe(false);
  });

  it('mostra a mensagem de muitas tentativas (429)', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas.'),
      ),
    );
    renderRoute('/entrar');

    await fillAndSubmit('ana@faisca.test', 'senha-ficticia-123');

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas seguidas.');
  });

  it('quem já entrou não vê a tela de entrar', async () => {
    server.use(loggedIn);
    const { router } = renderRoute('/entrar');

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('o botão Mostrar exibe a senha digitada', async () => {
    const user = userEvent.setup();
    renderRoute('/entrar');

    const password = await screen.findByLabelText('Senha');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
