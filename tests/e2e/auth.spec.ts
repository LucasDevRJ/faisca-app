import { expect, test } from '@playwright/test';
import { latestEmailLink } from '../fixtures/mailbox.js';
import { users } from '../fixtures/users.js';

// Fluxos de conta no navegador, passando pelo proxy /api do Vite até a API de testes.

test('quem não entrou é levado para a tela de entrar', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Que bom te ver' })).toBeVisible();
});

test('entrar, continuar logado ao recarregar e sair', async ({ page, context }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.patient.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.patient.password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  await expect(page.getByRole('heading', { name: 'Olá, Paciente!' })).toBeVisible();

  // O cookie de sessão existe, mas o JavaScript da página não consegue lê-lo (httpOnly).
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'faisca_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  expect(await page.evaluate(() => document.cookie)).not.toContain('faisca_session');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Olá, Paciente!' })).toBeVisible();

  await page.getByRole('button', { name: 'Sair' }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('cadastro, confirmação pelo link do e-mail e primeiro login', async ({ page, request }) => {
  const email = `e2e-${Date.now()}@faisca.test`;
  const password = 'senha-ficticia-789';

  await page.goto('/cadastro');
  await page.getByLabel('Como podemos te chamar?').fill('Bia Fictícia');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /Acompanhar pacientes/ }).check();
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByRole('heading', { name: 'Confira seu e-mail' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  // Abre o link do e-mail como a pessoa faria.
  await page.goto(await latestEmailLink(request, email));
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
  // O token sai da barra de endereço depois de lido.
  await expect(page).toHaveURL(/\/confirmar-email$/);

  await page.getByRole('link', { name: 'Entrar' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();

  // Só o perfil de terapeuta: o início leva para "Meus pacientes".
  await expect(page).toHaveURL(/\/pacientes$/);
  await expect(page.getByRole('heading', { name: 'Meus pacientes' })).toBeVisible();
});

test('esqueci a senha: link do e-mail, senha nova e login', async ({ page, request }) => {
  // Conta própria deste teste, para não trocar a senha dos usuários fixos.
  const email = `reset-${Date.now()}@faisca.test`;
  const signup = await request.post('/api/auth/signup', {
    data: { name: 'Caio Fictício', email, password: 'senha-antiga-123', profiles: { patient: true, therapist: false } },
  });
  // O cadastro tem rate limit (DEC-025): se estourar, o teste falha aqui, e não mais adiante.
  expect(signup.status()).toBe(202);

  await page.goto('/esqueci-a-senha');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Enviar link' }).click();
  await expect(page.getByText(/Se houver uma conta com esse e-mail/)).toBeVisible();

  await page.goto(await latestEmailLink(request, email));
  await page.getByLabel('Nova senha', { exact: true }).fill('senha-nova-456');
  await page.getByLabel('Repita a nova senha').fill('senha-nova-456');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('heading', { name: 'Senha nova criada' })).toBeVisible();

  // Redefinir a senha também confirma o e-mail (DEC-025), então já dá para entrar.
  await page.getByRole('link', { name: 'Entrar com a senha nova' }).click();
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('senha-nova-456');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Olá, Caio!' })).toBeVisible();
});
