import { expect, request, test, type Page } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

const DAY = '2026-09-21';

async function login(page: Page, credentials: typeof users.recordSearchPatient) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(credentials.email);
  await page.getByLabel('Senha', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);
}

test('paciente encontra e expande um registro sem guardar o termo na URL', async ({ page }) => {
  const api = await request.newContext({ baseURL: API_URL });
  const loginResponse = await api.post('/auth/login', { data: users.recordSearchPatient });
  expect(loginResponse.status()).toBe(200);
  const created = await api.post('/activities', {
    data: { status: 'PLANEJADA', name: 'Ensaio fictício de canto', activityDate: DAY },
  });
  expect(created.status()).toBe(201);
  await api.dispose();

  await login(page, users.recordSearchPatient);

  await page.getByRole('link', { name: 'Buscar nos registros' }).click();
  await expect(page).toHaveURL(/\/buscar$/);
  await page.getByRole('textbox', { name: 'O que você quer encontrar?' }).fill('ensaio fictício');
  await page.getByRole('textbox', { name: 'De' }).fill(DAY);
  await page.getByRole('textbox', { name: 'Até' }).fill(DAY);
  await page.getByRole('button', { name: 'Buscar' }).click();

  const result = page.locator('article').filter({ hasText: 'Ensaio fictício de canto' });
  await expect(result).toBeVisible();
  await expect(result.getByText('Atividades')).toBeVisible();
  await expect(result.locator('details')).not.toHaveAttribute('open');
  await result.getByText('Abrir registro completo').click();
  await expect(result.locator('details')).toHaveAttribute('open', '');
  await expect(result.getByText('Planejada')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});
