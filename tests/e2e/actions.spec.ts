import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Ação no navegador (DEC-052), passando pelo proxy /api do Vite até a API de testes: aceitar o
// aviso, planejar uma ação para hoje, contar como foi e ver o cartão com a expectativa ao lado.

test('aceitar o aviso, planejar uma ação, contar como foi e ver a expectativa ao lado do resultado', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.actionScreenPatient.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.actionScreenPatient.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);

  await page.getByRole('navigation', { name: 'Registros' }).getByRole('link', { name: 'Ação' }).click();
  await expect(page).toHaveURL(/\/acao$/);

  // A conta é de antes da Ação: o aceite vem primeiro.
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();

  await page.getByRole('link', { name: 'Nova ação' }).click();
  await expect(page).toHaveURL(/\/acao\/nova/);
  await page.getByLabel(/Prazer/).first().check();
  await page.getByLabel('O que você vai fazer?').fill('Ouvir um disco inteiro');
  await page.getByLabel('Quanto espera gostar').fill('3');
  await page.getByRole('button', { name: 'Salvar ação' }).click();

  await expect(page).toHaveURL(/\/acao$/);
  await expect(page.getByText('Ação salva.')).toBeVisible();
  const card = page.getByRole('article', { name: 'Ouvir um disco inteiro' });
  await card.getByRole('button', { name: 'Conta como foi?' }).click();

  const dialog = page.getByRole('dialog', { name: 'Conta como foi?' });
  await dialog.getByLabel('Prazer').fill('8');
  await dialog.getByLabel('Realização').fill('6');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();

  await expect(card).toContainText('Feita');
  await expect(card).toContainText('Esperava3');
  await expect(card).toContainText('Prazer8');
});
