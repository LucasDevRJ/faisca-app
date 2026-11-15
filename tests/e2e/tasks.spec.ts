import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

test('aceita aviso, cria tarefa e registra que não conseguiu fazer', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.taskScreenPatient.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.taskScreenPatient.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByRole('navigation', { name: 'Registros' }).getByRole('link', { name: 'Tarefas' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await page.getByRole('button', { name: 'Nova tarefa' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Reflexão fictícia');
  await page.getByLabel('O que ficou combinado?').fill('Descrição fictícia combinada na consulta.');
  await page.getByRole('button', { name: 'Salvar tarefa' }).click();
  const card = page.getByRole('article', { name: 'Reflexão fictícia' });
  await card.getByRole('button', { name: /Responder/ }).click();
  await page.getByRole('radio', { name: 'Não consegui fazer' }).check();
  await page.getByRole('button', { name: 'Salvar resposta' }).click();
  await expect(card.getByText('Não consegui fazer', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /Editar resposta/ })).toBeVisible();
  await expect(card.getByRole('button', { name: /Apagar tarefa/ })).toHaveCount(0);
});
