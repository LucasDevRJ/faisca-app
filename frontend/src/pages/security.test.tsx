import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

// Seção "Segurança" em Conta (DEC-086): trocar a senha e sair de todos os aparelhos. Senhas fictícias.
const CURRENT = 'senha-ficticia-123';
const NEW = 'senha-nova-ficticia-456';

beforeEach(() => {
  server.use(loggedIn);
});

async function securitySection() {
  return screen.findByRole('region', { name: 'Segurança' });
}

describe('/conta: trocar senha', () => {
  it('manda a atual e a nova, limpa os campos e diz que deu certo, sem sair da conta', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    server.use(
      http.post('*/api/auth/change-password', async ({ request }) => {
        sent.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute('/conta');

    const form = within(await securitySection()).getByRole('form', { name: 'Trocar senha' });
    expect(form).toHaveTextContent('Ao trocar, os outros aparelhos saem da conta. Este continua conectado.');
    await user.type(within(form).getByLabelText('Senha atual'), CURRENT);
    await user.type(within(form).getByLabelText('Senha nova'), NEW);
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }));

    expect(await within(form).findByRole('status')).toHaveTextContent('Pronto, senha trocada.');
    expect(sent).toEqual([{ currentPassword: CURRENT, newPassword: NEW }]);
    expect(within(form).getByLabelText('Senha atual')).toHaveValue('');
    expect(within(form).getByLabelText('Senha nova')).toHaveValue('');
    expect(router.state.location.pathname).toBe('/conta');
    // Campo de usuário escondido, para o gerenciador de senhas guardar a nova na conta certa.
    const username = form.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue('ana@faisca.test');
  });

  it('sem a atual ou com a nova curta: avisa nos campos e não chama a API', async () => {
    const user = userEvent.setup();
    const calls = vi.fn();
    server.use(
      http.post('*/api/auth/change-password', () => {
        calls();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/conta');

    const form = within(await securitySection()).getByRole('form', { name: 'Trocar senha' });
    await user.type(within(form).getByLabelText('Senha nova'), 'curta');
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }));

    expect(within(form).getByLabelText('Senha atual')).toHaveAccessibleDescription('Digite a senha atual.');
    expect(within(form).getByLabelText('Senha nova')).toHaveAccessibleDescription(
      /A senha precisa ter pelo menos 8 caracteres\./,
    );
    expect(calls).not.toHaveBeenCalled();
  });

  it('senha atual errada aparece no campo da atual', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/auth/change-password', () => apiError(400, 'INVALID_PASSWORD', 'A senha atual não confere.')),
    );
    renderRoute('/conta');

    const form = within(await securitySection()).getByRole('form', { name: 'Trocar senha' });
    await user.type(within(form).getByLabelText('Senha atual'), 'senha-errada');
    await user.type(within(form).getByLabelText('Senha nova'), NEW);
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }));

    await waitFor(() =>
      expect(within(form).getByLabelText('Senha atual')).toHaveAccessibleDescription('A senha atual não confere.'),
    );
    expect(within(form).getByRole('status')).toHaveTextContent('');

    // Ao corrigir a senha, o erro antigo sai do campo.
    await user.type(within(form).getByLabelText('Senha atual'), 'x');
    expect(within(form).getByLabelText('Senha atual')).not.toHaveAccessibleDescription('A senha atual não confere.');
  });

  it('nova igual à atual aparece no campo da nova', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/auth/change-password', () =>
        apiError(400, 'SAME_PASSWORD', 'Escolha uma senha diferente da atual.'),
      ),
    );
    renderRoute('/conta');

    const form = within(await securitySection()).getByRole('form', { name: 'Trocar senha' });
    await user.type(within(form).getByLabelText('Senha atual'), CURRENT);
    await user.type(within(form).getByLabelText('Senha nova'), CURRENT);
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }));

    await waitFor(() =>
      expect(within(form).getByLabelText('Senha nova')).toHaveAccessibleDescription(
        /Escolha uma senha diferente da atual\./,
      ),
    );
  });

  it('muitas tentativas: o aviso aparece no topo do formulário', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/auth/change-password', () =>
        apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.'),
      ),
    );
    renderRoute('/conta');

    const form = within(await securitySection()).getByRole('form', { name: 'Trocar senha' });
    await user.type(within(form).getByLabelText('Senha atual'), CURRENT);
    await user.type(within(form).getByLabelText('Senha nova'), NEW);
    await user.click(within(form).getByRole('button', { name: 'Trocar senha' }));

    expect(await within(form).findByText(/Muitas tentativas seguidas/)).toBeInTheDocument();
  });
});

describe('/conta: sair de todos os aparelhos', () => {
  it('confirma com a senha, sai e leva para entrar com o aviso', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    server.use(
      http.post('*/api/auth/logout-all', async ({ request }) => {
        sent.push(await request.json());
        // Como a API de verdade: depois disso, a sessão não vale mais. Sem isso, as telas ainda
        // abertas recarregam /auth/me "logadas" e a ida para /entrar vira uma corrida.
        server.use(
          http.get('*/api/auth/me', () => apiError(401, 'UNAUTHENTICATED', 'Entre na sua conta para continuar.')),
        );
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router } = renderRoute('/conta');

    const section = await securitySection();
    expect(section).toHaveTextContent('Neste aparelho você também vai precisar entrar de novo.');
    await user.click(within(section).getByRole('button', { name: 'Sair de todos os aparelhos' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de todos os aparelhos?' });
    expect(dialog).toHaveTextContent('Seus registros continuam guardados.');
    await user.type(within(dialog).getByLabelText('Sua senha'), CURRENT);
    await user.click(within(dialog).getByRole('button', { name: 'Sair de todos' }));

    expect(
      await screen.findByText('Pronto, você saiu de todos os aparelhos. Entre de novo para continuar.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/entrar');
    expect(sent).toEqual([{ password: CURRENT }]);
  });

  it('sem senha, avisa no campo e não chama a API', async () => {
    const user = userEvent.setup();
    const calls = vi.fn();
    server.use(
      http.post('*/api/auth/logout-all', () => {
        calls();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/conta');

    await user.click(within(await securitySection()).getByRole('button', { name: 'Sair de todos os aparelhos' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de todos os aparelhos?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sair de todos' }));

    expect(within(dialog).getByLabelText('Sua senha')).toHaveAccessibleDescription('Digite sua senha para confirmar.');
    expect(calls).not.toHaveBeenCalled();
  });

  it('senha errada: a mensagem aparece no campo e a pessoa continua na conta', async () => {
    const user = userEvent.setup();
    server.use(http.post('*/api/auth/logout-all', () => apiError(400, 'INVALID_PASSWORD', 'A senha não confere.')));
    const { router } = renderRoute('/conta');

    await user.click(within(await securitySection()).getByRole('button', { name: 'Sair de todos os aparelhos' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de todos os aparelhos?' });
    await user.type(within(dialog).getByLabelText('Sua senha'), 'senha-errada');
    await user.click(within(dialog).getByRole('button', { name: 'Sair de todos' }));

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Sua senha')).toHaveAccessibleDescription('A senha não confere.'),
    );
    expect(router.state.location.pathname).toBe('/conta');
  });

  it('muitas tentativas: o aviso aparece no topo da janela', async () => {
    const user = userEvent.setup();
    server.use(
      http.post('*/api/auth/logout-all', () =>
        apiError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.'),
      ),
    );
    renderRoute('/conta');

    await user.click(within(await securitySection()).getByRole('button', { name: 'Sair de todos os aparelhos' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de todos os aparelhos?' });
    await user.type(within(dialog).getByLabelText('Sua senha'), CURRENT);
    await user.click(within(dialog).getByRole('button', { name: 'Sair de todos' }));

    expect(await within(dialog).findByText(/Muitas tentativas seguidas/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Sua senha')).not.toHaveAccessibleDescription(/Muitas/);
  });

  it('se a rede cair e a sessão já tiver caído, o aparelho sai da conta', async () => {
    const user = userEvent.setup();
    let loggedOut = false;
    server.use(
      http.post('*/api/auth/logout-all', () => {
        loggedOut = true;
        return HttpResponse.error();
      }),
      http.get('*/api/auth/me', () =>
        loggedOut ? apiError(401, 'UNAUTHENTICATED', 'Entre para continuar.') : HttpResponse.json({ user: fakeUser }),
      ),
    );
    const { router } = renderRoute('/conta');

    await user.click(within(await securitySection()).getByRole('button', { name: 'Sair de todos os aparelhos' }));
    const dialog = screen.getByRole('dialog', { name: 'Sair de todos os aparelhos?' });
    await user.type(within(dialog).getByLabelText('Sua senha'), CURRENT);
    await user.click(within(dialog).getByRole('button', { name: 'Sair de todos' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/entrar'));
  });

  it('o aviso da tela de entrar só aparece vindo do "Sair de todos"', async () => {
    server.use(http.get('*/api/auth/me', () => apiError(401, 'UNAUTHENTICATED', 'Entre para continuar.')));
    renderRoute('/entrar');

    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
    expect(screen.queryByText(/você saiu de todos os aparelhos/)).not.toBeInTheDocument();
  });
});

describe('/conta: aviso de novos acessos', () => {
  const LABEL = 'Me avisar por e-mail quando alguém entrar na minha conta';

  it('vem ligado; desmarcar grava na hora e diz que deu certo', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    server.use(
      http.put('*/api/auth/login-alert', async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        sent.push(body);
        return HttpResponse.json({ user: { ...fakeUser, loginAlert: body.enabled } });
      }),
    );
    renderRoute('/conta');

    const group = within(await securitySection()).getByRole('group', { name: 'Aviso de novos acessos' });
    const box = within(group).getByRole('checkbox', { name: LABEL });
    expect(box).toBeChecked();
    expect(box).toHaveAccessibleDescription('Também chega uma notificação nos aparelhos onde você ligou as notificações.');

    await user.click(box);

    expect(await within(group).findByRole('status')).toHaveTextContent('Pronto, o aviso foi desligado.');
    expect(box).not.toBeChecked();
    expect(sent).toEqual([{ enabled: false }]);

    await user.click(box);
    await waitFor(() => expect(within(group).getByRole('status')).toHaveTextContent('Pronto, o aviso está ligado.'));
    expect(box).toBeChecked();
  });

  it('desligado na conta: a caixa vem desmarcada', async () => {
    server.use(http.get('*/api/auth/me', () => HttpResponse.json({ user: { ...fakeUser, loginAlert: false } })));
    renderRoute('/conta');

    const group = within(await securitySection()).getByRole('group', { name: 'Aviso de novos acessos' });
    expect(within(group).getByRole('checkbox', { name: LABEL })).not.toBeChecked();
  });

  it('se não gravar, avisa e a caixa continua como estava', async () => {
    const user = userEvent.setup();
    server.use(http.put('*/api/auth/login-alert', () => apiError(500, 'INTERNAL', 'Algo deu errado. Tente de novo.')));
    renderRoute('/conta');

    const group = within(await securitySection()).getByRole('group', { name: 'Aviso de novos acessos' });
    const box = within(group).getByRole('checkbox', { name: LABEL });
    await user.click(box);

    expect(await within(group).findByText('Algo deu errado. Tente de novo.')).toBeInTheDocument();
    expect(box).toBeChecked();
  });
});
