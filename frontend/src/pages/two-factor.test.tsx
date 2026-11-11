import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TwoFactorStatus } from '../features/auth/two-factor-api';
import { renderRoute } from '../test/render';
import { apiError, fakeUser, loggedIn, server } from '../test/server';

// Verificação em duas etapas (DEC-092): o cartão em Conta → Segurança e o passo do código no login.
// Senhas, códigos e segredos fictícios (regra 5).

// O jsdom não desenha em canvas: o QR vira uma imagem falsa.
vi.mock('qrcode', () => ({ default: { toDataURL: () => Promise.resolve('data:image/png;base64,QRFICTICIO') } }));

const PASSWORD = 'senha-ficticia-123';
const CODES = ['ABCD-2345', 'EFGH-6789', 'JKMN-2345', 'PQRS-6789', 'TVWX-2345', 'YZ23-4567', 'ABCD-8923', 'EFGH-4567', 'JKMN-8923', 'PQRS-4567'];

function status(overrides: Partial<TwoFactorStatus> = {}): TwoFactorStatus {
  return { available: true, emailEnabled: false, totpEnabled: false, recoveryCodesLeft: 0, ...overrides };
}

function withStatus(value: TwoFactorStatus) {
  server.use(http.get('*/api/auth/2fa', () => HttpResponse.json(value)));
}

async function twoFactorCard() {
  return screen.findByRole('group', { name: 'Verificação em duas etapas' });
}

describe('/conta: verificação em duas etapas', () => {
  beforeEach(() => {
    server.use(loggedIn);
  });

  it('desligada: explica, e a configuração guiada liga o código por e-mail e mostra os códigos uma vez', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let current = status();
    server.use(
      http.get('*/api/auth/2fa', () => HttpResponse.json(current)),
      http.post('*/api/auth/2fa/setup', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ method: 'EMAIL', emailHint: 'an•••@faisca.test' });
      }),
      http.post('*/api/auth/2fa/setup/confirm', async ({ request }) => {
        sent.push(await request.json());
        current = status({ emailEnabled: true, recoveryCodesLeft: 10 });
        return HttpResponse.json({ recoveryCodes: CODES });
      }),
    );
    renderRoute('/conta');

    const card = await twoFactorCard();
    expect(card).toHaveTextContent('mesmo que a senha vaze, ninguém entra sem o código');
    expect(await within(card).findByText('Desligada')).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Ativar' }));

    let dialog = await screen.findByRole('dialog', { name: 'Ativar a verificação em duas etapas' });
    expect(dialog).toHaveAccessibleDescription('Para começar, confirme a sua senha.');
    await user.type(within(dialog).getByLabelText('Sua senha'), PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    dialog = await screen.findByRole('dialog', { name: 'Como você quer receber o código?' });
    expect(within(dialog).getByRole('radio', { name: /Por e-mail/ })).toBeChecked();
    await user.click(within(dialog).getByText('Precisa de ajuda?'));
    expect(dialog).toHaveTextContent('O que é um app autenticador?');
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    dialog = await screen.findByRole('dialog', { name: 'Ativar a verificação em duas etapas' });
    expect(dialog).toHaveTextContent('Enviamos um código de 6 números para an•••@faisca.test.');
    await user.type(within(dialog).getByLabelText('Código'), '482913');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    dialog = await screen.findByRole('dialog', { name: 'Guarde os seus códigos de recuperação' });
    const list = within(dialog).getByRole('list', { name: 'Códigos de recuperação' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(10);
    expect(list).toHaveTextContent('ABCD-2345');
    expect(dialog).toHaveTextContent('Eles não aparecem de novo.');
    await user.click(within(dialog).getByRole('button', { name: 'Já guardei' }));

    dialog = await screen.findByRole('dialog', { name: 'Pronto, a verificação em duas etapas está ligada.' });
    expect(dialog).toHaveTextContent('os outros aparelhos saíram da sua conta. Este continua conectado.');
    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByRole('status')).toHaveTextContent('Pronto, a verificação em duas etapas está ligada.');
    expect(await within(card).findByText('Ligada: código por e-mail')).toBeInTheDocument();
    expect(sent).toEqual([
      { password: PASSWORD, method: 'EMAIL' },
      { method: 'EMAIL', otp: '482913' },
    ]);
  });

  it('app autenticador: mostra o QR e a chave em grupos de 4', async () => {
    const user = userEvent.setup();
    const confirmed: unknown[] = [];
    withStatus(status());
    server.use(
      http.post('*/api/auth/2fa/setup', () =>
        HttpResponse.json({ method: 'TOTP', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/ficticio' }),
      ),
      http.post('*/api/auth/2fa/setup/confirm', async ({ request }) => {
        confirmed.push(await request.json());
        return HttpResponse.json({ recoveryCodes: CODES });
      }),
    );
    renderRoute('/conta');

    await user.click(await within(await twoFactorCard()).findByRole('button', { name: 'Ativar' }));
    await user.type(await screen.findByLabelText('Sua senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('radio', { name: /Por um app autenticador/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ativar a verificação em duas etapas' });
    expect(within(dialog).getByRole('img', { name: /QR code/ })).toHaveAttribute(
      'src',
      'data:image/png;base64,QRFICTICIO',
    );
    expect(dialog).toHaveTextContent('JBSW Y3DP EHPK 3PXP');
    await user.type(within(dialog).getByLabelText('Código'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await screen.findByRole('dialog', { name: 'Guarde os seus códigos de recuperação' })).toBeInTheDocument();
    expect(confirmed).toEqual([{ method: 'TOTP', otp: '123456' }]);
  });

  it('senha errada ao escolher o jeito: volta ao passo da senha, com o erro no campo', async () => {
    const user = userEvent.setup();
    withStatus(status());
    server.use(http.post('*/api/auth/2fa/setup', () => apiError(400, 'INVALID_PASSWORD', 'A senha não confere.')));
    renderRoute('/conta');

    await user.click(await within(await twoFactorCard()).findByRole('button', { name: 'Ativar' }));
    await user.type(await screen.findByLabelText('Sua senha'), 'senha-errada');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));

    expect(await screen.findByLabelText('Sua senha')).toHaveAccessibleDescription('A senha não confere.');
  });

  it('ligada: mostra os jeitos e avisa quando restam poucos códigos', async () => {
    withStatus(status({ emailEnabled: true, totpEnabled: true, recoveryCodesLeft: 2 }));
    renderRoute('/conta');

    const card = await twoFactorCard();
    expect(await within(card).findByText('Ligada: código por e-mail · app autenticador')).toBeInTheDocument();
    expect(card).toHaveTextContent('Restam 2 de 10 códigos de recuperação. Restam poucos códigos.');
    // Com os dois ligados, não há o que adicionar.
    expect(within(card).queryByRole('button', { name: 'Adicionar outro jeito' })).not.toBeInTheDocument();
  });

  it('adicionar o app com o e-mail ligado pede a senha e um código, aqui de recuperação', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    withStatus(status({ emailEnabled: true, recoveryCodesLeft: 10 }));
    server.use(
      http.post('*/api/auth/2fa/setup', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ method: 'TOTP', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/ficticio' });
      }),
      http.post('*/api/auth/2fa/setup/confirm', () => HttpResponse.json({ recoveryCodes: null })),
    );
    renderRoute('/conta');

    await user.click(await within(await twoFactorCard()).findByRole('button', { name: 'Adicionar outro jeito' }));
    let dialog = await screen.findByRole('dialog', { name: 'Adicionar outro jeito de confirmar' });
    expect(dialog).toHaveAccessibleDescription('Confirme a sua senha e um código do jeito que já está ligado.');
    await user.type(within(dialog).getByLabelText('Sua senha'), PASSWORD);
    await user.click(within(dialog).getByRole('radio', { name: 'Código de recuperação' }));
    await user.type(within(dialog).getByLabelText('Código'), 'ABCD-2345');
    await user.click(within(dialog).getByRole('button', { name: 'Continuar' }));

    dialog = await screen.findByRole('dialog', { name: 'Adicionar outro jeito de confirmar' });
    await user.type(await within(dialog).findByLabelText('Código'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    // Segundo jeito: sem códigos novos, direto para o pronto.
    expect(
      await screen.findByRole('dialog', { name: 'Pronto, agora você tem dois jeitos de confirmar.' }),
    ).toBeInTheDocument();
    expect(sent).toEqual([{ password: PASSWORD, method: 'TOTP', via: 'RECOVERY', otp: 'ABCD-2345' }]);
  });

  it('desligar: manda o código por e-mail quando pedido e confirma com senha e código', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    let current = status({ emailEnabled: true, recoveryCodesLeft: 10 });
    server.use(
      http.get('*/api/auth/2fa', () => HttpResponse.json(current)),
      http.post('*/api/auth/2fa/email-code', () => HttpResponse.json({ emailHint: 'an•••@faisca.test' })),
      http.post('*/api/auth/2fa/disable', async ({ request }) => {
        sent.push(await request.json());
        current = status();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute('/conta');

    const card = await twoFactorCard();
    await user.click(await within(card).findByRole('button', { name: 'Desligar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desligar a verificação em duas etapas?' });
    expect(dialog).toHaveAccessibleDescription(
      'Sem ela, só a senha basta para entrar na sua conta. Os códigos de recuperação deixam de valer.',
    );
    await user.type(within(dialog).getByLabelText('Sua senha'), PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Enviar código por e-mail' }));
    expect(await within(dialog).findByText('Enviamos um código de 6 números para an•••@faisca.test.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Código'), '482913');
    await user.click(within(dialog).getByRole('button', { name: 'Desligar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByRole('status')).toHaveTextContent('Pronto, a verificação em duas etapas foi desligada.');
    expect(await within(card).findByText('Desligada')).toBeInTheDocument();
    expect(sent).toEqual([{ password: PASSWORD, via: 'EMAIL', otp: '482913' }]);
  });

  it('gerar códigos novos: código errado aparece no campo do código', async () => {
    const user = userEvent.setup();
    withStatus(status({ totpEnabled: true, recoveryCodesLeft: 4 }));
    server.use(
      http.post('*/api/auth/2fa/recovery-codes', () =>
        apiError(400, 'INVALID_CODE', 'Esse código não confere. Confira e tente de novo.'),
      ),
    );
    renderRoute('/conta');

    await user.click(await within(await twoFactorCard()).findByRole('button', { name: 'Códigos de recuperação' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gerar códigos novos' });
    await user.type(within(dialog).getByLabelText('Sua senha'), PASSWORD);
    await user.type(within(dialog).getByLabelText('Código'), '000000');
    await user.click(within(dialog).getByRole('button', { name: 'Gerar códigos novos' }));

    expect(await within(dialog).findByLabelText('Código')).toHaveAccessibleDescription(
      /Esse código não confere\. Confira e tente de novo\./,
    );
  });

  it('gerar códigos novos: mostra os códigos e, depois de guardados, avisa que valem', async () => {
    const user = userEvent.setup();
    const sent: unknown[] = [];
    withStatus(status({ totpEnabled: true, recoveryCodesLeft: 2 }));
    server.use(
      http.post('*/api/auth/2fa/recovery-codes', async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ recoveryCodes: CODES });
      }),
    );
    renderRoute('/conta');

    const card = await twoFactorCard();
    await user.click(await within(card).findByRole('button', { name: 'Códigos de recuperação' }));
    let dialog = await screen.findByRole('dialog', { name: 'Gerar códigos novos' });
    await user.type(within(dialog).getByLabelText('Sua senha'), PASSWORD);
    await user.type(within(dialog).getByLabelText('Código'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Gerar códigos novos' }));

    dialog = await screen.findByRole('dialog', { name: 'Guarde os seus códigos de recuperação' });
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10);
    await user.click(within(dialog).getByRole('button', { name: 'Já guardei' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(card).getByRole('status')).toHaveTextContent('Pronto, os códigos novos estão valendo.');
    expect(sent).toEqual([{ password: PASSWORD, via: 'TOTP', otp: '123456' }]);
  });

  it('ao cancelar, o foco volta ao título do cartão; ao trocar de passo, vai ao título da janela', async () => {
    const user = userEvent.setup();
    withStatus(status());
    renderRoute('/conta');

    const card = await twoFactorCard();
    await user.click(await within(card).findByRole('button', { name: 'Ativar' }));
    await user.type(await screen.findByLabelText('Sua senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Como você quer receber o código?' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(within(card).getByRole('heading', { name: 'Verificação em duas etapas' })).toHaveFocus());
  });

  it('a senha, o segredo do app e os códigos não ficam na memória do app depois que a janela fecha', async () => {
    const user = userEvent.setup();
    withStatus(status());
    server.use(
      http.post('*/api/auth/2fa/setup', () =>
        HttpResponse.json({ method: 'TOTP', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/ficticio' }),
      ),
      http.post('*/api/auth/2fa/setup/confirm', () => HttpResponse.json({ recoveryCodes: CODES })),
    );
    const { queryClient } = renderRoute('/conta');

    await user.click(await within(await twoFactorCard()).findByRole('button', { name: 'Ativar' }));
    await user.type(await screen.findByLabelText('Sua senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('radio', { name: /Por um app autenticador/ }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(await screen.findByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await user.click(await screen.findByRole('button', { name: 'Já guardei' }));
    await user.click(await screen.findByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await waitFor(() => {
      const kept = JSON.stringify(queryClient.getMutationCache().getAll().map((mutation) => mutation.state));
      expect(kept).not.toContain(PASSWORD);
      expect(kept).not.toContain('JBSWY3DPEHPK3PXP');
      expect(kept).not.toContain('ABCD-2345');
    });
    // O fluxo inteiro (senha, escolha, código, códigos e pronto) é longo.
  }, 30_000);

  it('sem a chave no servidor: avisa e não oferece ativar', async () => {
    withStatus(status({ available: false }));
    renderRoute('/conta');

    const card = await twoFactorCard();
    expect(
      await within(card).findByText('A verificação em duas etapas está indisponível agora. Tente de novo mais tarde.'),
    ).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Ativar' })).not.toBeInTheDocument();
  });
});

describe('login com verificação em duas etapas', () => {
  async function enterPassword() {
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('E-mail'), 'ana@faisca.test');
    await user.type(screen.getByLabelText('Senha'), PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    return user;
  }

  it('app autenticador: a senha abre o passo do código, e o código certo abre o app', async () => {
    const verified: unknown[] = [];
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ twoFactor: { methods: ['TOTP'], preferred: 'TOTP', emailHint: 'an•••@faisca.test' } }),
      ),
      http.post('*/api/auth/2fa/login/verify', async ({ request }) => {
        verified.push(await request.json());
        server.use(loggedIn);
        return HttpResponse.json({ user: fakeUser });
      }),
    );
    const { router } = renderRoute('/entrar');

    const user = await enterPassword();
    expect(await screen.findByRole('heading', { name: 'Confirme que é você' })).toBeInTheDocument();
    expect(screen.getByText('Digite o código que aparece no seu app autenticador.')).toBeInTheDocument();
    // O formulário da senha saiu da tela: o foco vai para o campo do código.
    await waitFor(() => expect(screen.getByLabelText('Código')).toHaveFocus());
    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Olá, Ana!' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/registros');
    expect(verified).toEqual([{ via: 'TOTP', otp: '123456' }]);
  });

  it('e-mail: o código sai sozinho uma vez, e dá para usar um código de recuperação', async () => {
    let emails = 0;
    const verified: unknown[] = [];
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ twoFactor: { methods: ['EMAIL'], preferred: 'EMAIL', emailHint: 'an•••@faisca.test' } }),
      ),
      http.post('*/api/auth/2fa/login/email', () => {
        emails += 1;
        return new HttpResponse(null, { status: 204 });
      }),
      http.post('*/api/auth/2fa/login/verify', async ({ request }) => {
        verified.push(await request.json());
        return HttpResponse.json({ user: fakeUser });
      }),
    );
    renderRoute('/entrar');

    const user = await enterPassword();
    expect(await screen.findByText('Enviamos um código de 6 números para an•••@faisca.test.')).toBeInTheDocument();
    await waitFor(() => expect(emails).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Usar outro jeito' }));
    // Só o e-mail ligado: o app autenticador não aparece como opção.
    expect(screen.queryByRole('button', { name: 'App autenticador' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Código de recuperação' }));
    expect(screen.getByText('Digite um dos seus códigos de recuperação.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Código'), 'abcd-2345');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(verified).toEqual([{ via: 'RECOVERY', otp: 'abcd-2345' }]));
    expect(emails).toBe(1);
  });

  it('"Não consigo entrar" mostra os caminhos e o contato do suporte', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ twoFactor: { methods: ['TOTP'], preferred: 'TOTP', emailHint: 'an•••@faisca.test' } }),
      ),
    );
    renderRoute('/entrar');

    const user = await enterPassword();
    await user.click(await screen.findByText('Não consigo entrar'));
    expect(screen.getByRole('link', { name: 'suporte@minhafaisca.com.br' })).toHaveAttribute(
      'href',
      'mailto:suporte@minhafaisca.com.br',
    );
  });

  it('passo vencido: volta para o e-mail e a senha, com o aviso', async () => {
    server.use(
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ twoFactor: { methods: ['TOTP'], preferred: 'TOTP', emailHint: 'an•••@faisca.test' } }),
      ),
      http.post('*/api/auth/2fa/login/verify', () =>
        apiError(401, 'TWO_FACTOR_EXPIRED', 'O tempo para confirmar acabou. Entre de novo com o seu e-mail e a sua senha.'),
      ),
    );
    renderRoute('/entrar');

    const user = await enterPassword();
    await user.type(await screen.findByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Que bom te ver' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('O tempo para confirmar acabou.');
    await waitFor(() => expect(screen.getByRole('alert').parentElement).toHaveFocus());
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });
});
