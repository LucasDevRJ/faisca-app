import { expect, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

test('abre as páginas de preferências a partir de Conta no celular', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const login = await page.request.post(`${API_URL}/auth/login`, { data: users.patient });
  expect(login.status()).toBe(200);
  await page.goto('/conta');
  const settings = page.getByRole('navigation', { name: 'Preferências da conta' });
  for (const [title, heading] of [
    ['Personalização', 'Paleta de cores'],
    ['Acessibilidade', 'Preferências de acessibilidade'],
    ['Notificações', 'Novidades por e-mail'],
  ]) {
    await settings.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeFocused();
    await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.getByRole('link', { name: /Voltar para Conta/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Conta' })).toBeVisible();
  }

  await page.goto('/conta#lembretes');
  await expect(page).toHaveURL(/\/conta\/notificacoes#lembretes$/);
  await expect(page.getByRole('heading', { name: 'Lembretes', exact: true })).toBeFocused();
});

// Excluir a própria conta no navegador (SPEC, "Privacidade"; DEC-035). Usa uma conta semeada
// só para este teste, que deixa de existir no meio dele.

test('excluir a conta: senha errada não apaga; com a certa, sai e não entra mais', async ({ page }) => {
  const { email, password } = users.toDelete;
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);

  await page.getByRole('link', { name: 'Conta' }).click();
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Excluir sua conta?' });

  // Senha errada: a conta continua.
  await dialog.getByLabel('Sua senha').fill('senha-errada-456');
  await dialog.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(dialog.getByText('A senha não confere.')).toBeVisible();

  await dialog.getByLabel('Sua senha').fill(password);
  await dialog.getByRole('button', { name: 'Excluir minha conta' }).click();

  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText('Sua conta foi excluída.')).toBeVisible();

  // A sessão acabou e a conta não existe mais.
  await page.goto('/registros');
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('E-mail ou senha não conferem.')).toBeVisible();
});
