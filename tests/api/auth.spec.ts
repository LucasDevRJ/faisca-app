import { expect, test, type APIResponse } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Sessão ponta a ponta contra a API real (banco faisca_test).
// Base para os testes de autorização da regra 1 nas próximas etapas.

function sessionCookie(res: APIResponse): string | undefined {
  return res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .find((value) => value.startsWith('faisca_session='));
}

test('GET /auth/me sem sessão responde 401', async ({ request }) => {
  const res = await request.get('/auth/me');

  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe('UNAUTHENTICATED');
});

test('login abre sessão em cookie httpOnly e SameSite=Lax', async ({ request }) => {
  const login = await request.post('/auth/login', { data: users.patient });

  expect(login.status()).toBe(200);
  const cookie = sessionCookie(login);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);

  // O contexto de request do Playwright guarda o cookie, como um navegador.
  const me = await request.get('/auth/me');
  expect(me.status()).toBe(200);
  expect((await me.json()).user).toMatchObject({
    email: users.patient.email,
    profiles: { patient: true, therapist: false },
  });
});

test('logout encerra a sessão', async ({ request }) => {
  await request.post('/auth/login', { data: users.therapist });

  const logout = await request.post('/auth/logout');
  const me = await request.get('/auth/me');

  expect(logout.status()).toBe(204);
  expect(me.status()).toBe(401);
});

test('credencial errada não abre sessão', async ({ request }) => {
  const login = await request.post('/auth/login', {
    data: { email: users.patient.email, password: 'senha-errada-123' },
  });

  expect(login.status()).toBe(401);
  expect(sessionCookie(login)).toBeUndefined();
});

test('cadastro → confirmação por e-mail → login', async ({ request }) => {
  const email = `cadastro-${Date.now()}@faisca.test`;
  const password = 'senha-ficticia-456';

  const signup = await request.post('/auth/signup', {
    data: { name: 'Nova Pessoa Fictícia', email, password, profiles: { patient: true, therapist: true } },
  });
  expect(signup.status()).toBe(202);

  // Antes de confirmar, a senha certa leva a 403.
  const early = await request.post('/auth/login', { data: { email, password } });
  expect(early.status()).toBe(403);

  const mail = await request.get('/__test__/emails/latest', { params: { to: email } });
  const token = new URL(/https?:\/\/\S+/.exec((await mail.json()).text)![0]).searchParams.get('token');
  expect(token).toBeTruthy();

  const confirm = await request.post('/auth/confirm-email', { data: { token } });
  expect(confirm.status()).toBe(204);

  const login = await request.post('/auth/login', { data: { email, password } });
  expect(login.status()).toBe(200);
  expect((await login.json()).user.profiles).toEqual({ patient: true, therapist: true });
});
