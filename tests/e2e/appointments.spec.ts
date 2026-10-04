import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Agenda de consultas no navegador (DEC-045), passando pelo proxy /api do Vite até a API de testes:
// aceitar o aviso, configurar a agenda, desmarcar com motivo e desfazer.

// Amanhã, no fuso de São Paulo: a primeira sessão ainda não aconteceu, seja qual for a hora do teste.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

test('aceitar o aviso, configurar a agenda, desmarcar com motivo e desfazer', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(users.records.email);
  await page.getByLabel('Senha', { exact: true }).fill(users.records.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);

  const card = page.getByRole('region', { name: 'Consultas' });
  await card.getByRole('link', { name: 'Configurar agenda' }).click();
  await expect(page).toHaveURL(/\/consultas$/);

  // A conta é de antes da agenda: o aceite vem antes de gravar hora e motivos.
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();

  await page.getByRole('button', { name: 'Configurar agenda' }).click();
  const dialog = page.getByRole('dialog', { name: 'Configurar agenda' });
  await dialog.getByLabel('Dia da primeira sessão').fill(tomorrow);
  await dialog.getByLabel('Hora').fill('14:00');
  await dialog.getByRole('button', { name: 'Salvar' }).click();
  await expect(dialog).toBeHidden();

  const upcoming = page.getByRole('region', { name: 'Próximas' });
  await expect(upcoming.getByRole('listitem')).toHaveCount(6);
  await expect(upcoming.getByRole('listitem').first()).toContainText('às 14:00 · amanhã');

  // Desmarcar a primeira, com motivo.
  await upcoming.getByRole('button', { name: /^Desmarcar sessão/ }).first().click();
  const cancel = page.getByRole('dialog', { name: 'Desmarcar esta sessão?' });
  await cancel.getByLabel('Motivo').fill('Motivo fictício');
  await cancel.getByRole('button', { name: 'Desmarcar' }).click();
  await expect(cancel).toBeHidden();
  const first = upcoming.getByRole('listitem').first();
  await expect(first).toContainText('desmarcada');
  await expect(first).toContainText('Motivo: Motivo fictício');

  // Desfazer devolve a sessão.
  await first.getByRole('button', { name: /Desfazer a desmarcação/ }).click();
  await expect(upcoming.getByRole('listitem').first()).not.toContainText('desmarcada');

  // No card, a próxima sessão com a hora.
  await page.getByRole('link', { name: '‹ Meus registros' }).click();
  await expect(card.getByText('Próxima')).toBeVisible();
  await expect(card).toContainText('às 14:00 · amanhã');

  // A tela abre no ciclo da consulta de amanhã (DEC-050), com a contagem.
  const [, month, dayOfMonth] = tomorrow.split('-');
  await expect(page.getByRole('heading', { name: `Consulta de ${dayOfMonth}/${month}` })).toBeVisible();
  await expect(page.getByText('Sua consulta é amanhã.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ciclo', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
