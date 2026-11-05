import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// "Sair de todos os aparelhos" e "Trocar senha" (DEC-085) contra a API real: pedem a senha,
// derrubam as sessões da própria conta e não tocam nas de outra pessoa. Usa a conta só deste
// arquivo (users.sessions).

test('com a senha, as sessões dos dois aparelhos caem; as de outra pessoa, não', async ({ playwright, baseURL }) => {
  const phone = await playwright.request.newContext({ baseURL });
  const laptop = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  try {
    expect((await phone.post('/auth/login', { data: users.sessions })).status()).toBe(200);
    expect((await laptop.post('/auth/login', { data: users.sessions })).status()).toBe(200);
    expect((await other.post('/auth/login', { data: users.therapist })).status()).toBe(200);

    // Senha errada não derruba nada.
    const wrong = await phone.post('/auth/logout-all', { data: { password: 'senha-errada-456' } });
    expect(wrong.status()).toBe(400);
    expect((await laptop.get('/auth/me')).status()).toBe(200);

    expect((await phone.post('/auth/logout-all', { data: { password: users.sessions.password } })).status()).toBe(204);

    expect((await phone.get('/auth/me')).status()).toBe(401);
    expect((await laptop.get('/auth/me')).status()).toBe(401);
    expect((await other.get('/auth/me')).status()).toBe(200);

    // Entrar de novo funciona.
    expect((await laptop.post('/auth/login', { data: users.sessions })).status()).toBe(200);
    expect((await laptop.get('/auth/me')).status()).toBe(200);
  } finally {
    await Promise.all([phone.dispose(), laptop.dispose(), other.dispose()]);
  }
});

test('sem sessão, "Sair de todos" responde 401', async ({ request }) => {
  const res = await request.post('/auth/logout-all', { data: { password: users.sessions.password } });
  expect(res.status()).toBe(401);
});

// "Trocar senha" (DEC-085): este aparelho continua, o outro sai, e só a senha nova entra.
test('trocar a senha mantém este aparelho e derruba o outro', async ({ playwright, baseURL }) => {
  const phone = await playwright.request.newContext({ baseURL });
  const laptop = await playwright.request.newContext({ baseURL });
  const newPassword = 'senha-nova-ficticia-789';
  try {
    expect((await phone.post('/auth/login', { data: users.sessions })).status()).toBe(200);
    expect((await laptop.post('/auth/login', { data: users.sessions })).status()).toBe(200);

    const wrong = await phone.post('/auth/change-password', {
      data: { currentPassword: 'senha-errada-456', newPassword },
    });
    expect(wrong.status()).toBe(400);

    const res = await phone.post('/auth/change-password', {
      data: { currentPassword: users.sessions.password, newPassword },
    });
    expect(res.status()).toBe(204);
    expect((await phone.get('/auth/me')).status()).toBe(200);
    expect((await laptop.get('/auth/me')).status()).toBe(401);
    expect((await laptop.post('/auth/login', { data: users.sessions })).status()).toBe(401);
    expect((await laptop.post('/auth/login', { data: { email: users.sessions.email, password: newPassword } })).status()).toBe(200);
  } finally {
    await Promise.all([phone.dispose(), laptop.dispose()]);
  }
});

test('sem sessão, "Trocar senha" responde 401', async ({ request }) => {
  const res = await request.post('/auth/change-password', {
    data: { currentPassword: users.sessions.password, newPassword: 'senha-nova-ficticia-789' },
  });
  expect(res.status()).toBe(401);
});
