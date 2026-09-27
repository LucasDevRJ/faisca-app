import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Consultas no navegador, passando pelo proxy /api do Vite até a API de testes.

test('cadastrar a consulta de hoje, ver no card e o selo na semana', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.records.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.records.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);

  const card = page.getByRole('region', { name: 'Consultas' });
  await card.getByRole('link').click();
  await expect(page).toHaveURL(/\/consultas$/);

  // O formulário já abre com a data de hoje.
  await page.getByRole('button', { name: 'Nova consulta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nova consulta' });
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('region', { name: 'Anteriores' }).getByText('hoje')).toBeVisible();

  // Consulta de hoje é a "última" (SPEC) e marca o dia na semana.
  await page.getByRole('link', { name: '‹ Meus registros' }).click();
  await expect(card.getByText('Última')).toBeVisible();
  const todayHeading = page.getByRole('heading', { level: 3 }).filter({ hasText: 'hoje' });
  await expect(todayHeading.getByText('consulta')).toBeVisible();
});
