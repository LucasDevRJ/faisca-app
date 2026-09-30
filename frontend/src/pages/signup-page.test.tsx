import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../test/render';
import { apiError, server } from '../test/server';

async function fillForm({ password = 'senha-ficticia-123', patient = true, therapist = false, privacy = true } = {}) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Como podemos te chamar?'), 'Ana Fictícia');
  await user.type(screen.getByLabelText('E-mail'), 'ana@faisca.test');
  await user.type(screen.getByLabelText('Senha'), password);
  if (patient) await user.click(screen.getByRole('checkbox', { name: /Registrar minhas atividades/ }));
  if (therapist) await user.click(screen.getByRole('checkbox', { name: /Acompanhar pacientes/ }));
  if (privacy) await user.click(screen.getByRole('checkbox', { name: /aviso de privacidade/ }));
  return user;
}

describe('SignupPage', () => {
  it('cria a conta com os perfis escolhidos e pede para conferir o e-mail', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/signup', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ message: 'ok' }, { status: 202 });
      }),
    );
    const { router } = renderRoute('/cadastro');

    const user = await fillForm({ patient: true, therapist: true });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(screen.getByText(/ana@faisca\.test/)).toBeInTheDocument();
    // O e-mail vai no state, não na URL.
    expect(router.state.location.search).toBe('');
    expect(body).toEqual({
      name: 'Ana Fictícia',
      email: 'ana@faisca.test',
      password: 'senha-ficticia-123',
      profiles: { patient: true, therapist: true },
      acceptPrivacy: true,
    });
  });

  it('exige concordar com o aviso de privacidade, que abre em outra aba', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/signup', () => {
        called = true;
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    renderRoute('/cadastro');

    const user = await fillForm({ privacy: false });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    const checkbox = screen.getByRole('checkbox', { name: /aviso de privacidade/ });
    expect(checkbox).toHaveAccessibleDescription(
      'Para criar a conta, é preciso concordar com o aviso de privacidade.',
    );
    expect(checkbox).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('link', { name: 'aviso de privacidade' })).toHaveAttribute('target', '_blank');
    expect(called).toBe(false);
  });

  it('exige escolher pelo menos um perfil', async () => {
    let called = false;
    server.use(
      http.post('*/api/auth/signup', () => {
        called = true;
        return HttpResponse.json({}, { status: 202 });
      }),
    );
    renderRoute('/cadastro');

    const user = await fillForm({ patient: false });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByText('Escolha pelo menos uma opção.')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('avisa sobre senha curta antes de enviar', async () => {
    renderRoute('/cadastro');

    const user = await fillForm({ password: 'curta' });
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription(
      /A senha precisa ter pelo menos 8 caracteres\./,
    );
  });

  it('mostra no campo o erro de validação que vem da API', async () => {
    server.use(
      http.post('*/api/auth/signup', () =>
        HttpResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados inválidos.',
              issues: [{ path: 'email', message: 'Informe um e-mail válido.' }],
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderRoute('/cadastro');

    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    await waitFor(() =>
      expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe um e-mail válido.'),
    );
  });

  it('mostra a mensagem de muitas tentativas (429)', async () => {
    server.use(
      http.post('*/api/auth/signup', () => apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas.')),
    );
    renderRoute('/cadastro');

    const user = await fillForm();
    await user.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas seguidas.');
  });
});

describe('CheckEmailPage', () => {
  it('reenvia a confirmação para o e-mail do cadastro', async () => {
    let resentTo: unknown;
    server.use(
      http.post('*/api/auth/resend-confirmation', async ({ request }) => {
        resentTo = ((await request.json()) as { email: string }).email;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderRoute('/verifique-seu-email', { state: { email: 'ana@faisca.test' } });

    await user.click(await screen.findByRole('button', { name: 'Reenviar e-mail' }));

    expect(await screen.findByText(/Enviamos de novo/)).toBeInTheDocument();
    expect(resentTo).toBe('ana@faisca.test');
  });

  it('aberta direto, sem e-mail, não mostra o botão de reenviar', () => {
    renderRoute('/verifique-seu-email');

    expect(screen.getByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar e-mail' })).not.toBeInTheDocument();
  });
});
