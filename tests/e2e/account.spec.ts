import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

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
