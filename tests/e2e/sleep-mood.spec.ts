import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Sono e humor (DEC-108): o fluxo principal, como a pessoa usaria. Conta sem aceite: aceita o aviso
// novo no próprio cartão e registra o dia de hoje.
test('aceita o aviso, registra o sono e o humor de hoje e vê o resumo no cartão', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.sleepScreenPatient.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.sleepScreenPatient.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  const card = page.getByRole('region', { name: 'Sono e humor de hoje' });
  await card.getByRole('button', { name: /Registrar/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();

  const dialog = page.getByRole('dialog', { name: /Sono e humor de/ });
  await dialog.getByLabel('Que horas você deitou?').fill('23:30');
  await dialog.getByLabel('Que horas acordou?').fill('07:00');
  await expect(dialog.getByText('Dá 7h30 de sono.')).toBeVisible();
  await dialog.getByLabel('Uma palavra ou frase para o dia (opcional)').fill('fictícia');
  await dialog.getByRole('button', { name: 'Salvar' }).click();

  await expect(card.getByText('Dormiu 7h30')).toBeVisible();
  await expect(card.getByText('Registro do dia salvo.')).toBeVisible();
});
