import { expect, test, type APIRequestContext } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Verificação em duas etapas (DEC-092) contra a API real: ligar o código por e-mail, entrar com ele
// e ver que só a senha não abre a sessão. Usa a conta só deste arquivo (users.twoFactor).

async function lastCode(request: APIRequestContext): Promise<string> {
  const mail = await request.get('/__test__/emails/latest', { params: { to: users.twoFactor.email } });
  const code = /é (\d{6})\./.exec((await mail.json()).text)?.[1];
  expect(code).toBeTruthy();
  return code!;
}

test('liga o código por e-mail; depois, a senha sozinha não entra e o código abre a sessão', async ({ playwright, baseURL }) => {
  const setup = await playwright.request.newContext({ baseURL });
  const login = await playwright.request.newContext({ baseURL });
  try {
    expect((await setup.post('/auth/login', { data: users.twoFactor })).status()).toBe(200);
    expect((await setup.post('/auth/2fa/setup', { data: { password: users.twoFactor.password, method: 'EMAIL' } })).status()).toBe(200);
    const confirm = await setup.post('/auth/2fa/setup/confirm', { data: { method: 'EMAIL', otp: await lastCode(setup) } });
    expect(confirm.status()).toBe(200);
    expect((await confirm.json()).recoveryCodes).toHaveLength(10);

    const first = await login.post('/auth/login', { data: users.twoFactor });
    expect(first.status()).toBe(200);
    expect((await first.json()).twoFactor.methods).toEqual(['EMAIL']);
    expect((await login.get('/auth/me')).status()).toBe(401);

    expect((await login.post('/auth/2fa/login/email')).status()).toBe(204);
    const wrong = await login.post('/auth/2fa/login/verify', { data: { via: 'EMAIL', otp: '000000' } });
    expect([400]).toContain(wrong.status());
    const verify = await login.post('/auth/2fa/login/verify', { data: { via: 'EMAIL', otp: await lastCode(login) } });
    expect(verify.status()).toBe(200);
    expect((await login.get('/auth/me')).status()).toBe(200);
  } finally {
    await Promise.all([setup.dispose(), login.dispose()]);
  }
});

test('sem sessão nem passo do código, as rotas do 2FA respondem 401', async ({ request }) => {
  expect((await request.get('/auth/2fa')).status()).toBe(401);
  expect((await request.post('/auth/2fa/login/verify', { data: { via: 'EMAIL', otp: '123456' } })).status()).toBe(401);
});
