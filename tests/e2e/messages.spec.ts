import { expect, request, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

test('paciente e profissional trocam mensagens e perdem acesso após desfazer o vínculo', async ({ page }) => {
  const patient = await request.newContext({ baseURL: API_URL });
  const professional = await request.newContext({ baseURL: API_URL });
  try {
    expect((await patient.post('/auth/login', { data: users.messagesPatient })).status()).toBe(200);
    expect((await professional.post('/auth/login', { data: users.messagesProfessional })).status()).toBe(200);
    const generated = await patient.post('/link/code');
    expect(generated.status()).toBe(201);
    const { code } = await generated.json();
    expect((await professional.post('/links/redeem-code', { data: { code } })).status()).toBe(201);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/entrar');
    await page.getByLabel('E-mail').fill(users.messagesPatient.email);
    await page.getByLabel('Senha', { exact: true }).fill(users.messagesPatient.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.getByRole('link', { name: 'Mensagens', exact: true }).click();
    await page.getByRole('link', { name: 'Profissional Mensagens Fictícia' }).click();
    await page.getByRole('textbox', { name: 'Mensagem' }).fill('Pode confirmar o horário fictício?');
    await page.getByRole('button', { name: 'Enviar mensagem' }).click();
    await expect(page.getByRole('list', { name: 'Histórico de mensagens' })).toContainText('Pode confirmar o horário fictício?');
    const thread = new URL(page.url()).pathname.replace('/mensagens/', '/messages/');
    const received = await professional.get(thread);
    expect(received.status()).toBe(200);
    expect((await received.json()).messages[0]).toMatchObject({ mine: false, body: 'Pode confirmar o horário fictício?' });
    expect((await professional.post(thread, { data: { topic: 'LOGISTICA', body: 'Horário fictício confirmado.' } })).status()).toBe(201);
    await page.reload();
    await expect(page.getByText('Horário fictício confirmado.')).toBeVisible();

    for (const theme of ['Claro', 'Escuro']) {
      await page.locator('label').filter({ hasText: new RegExp(`^${theme}$`) }).click();
      await expect(page.getByRole('radio', { name: theme, exact: true })).toBeChecked();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
      await expect(page.getByRole('textbox', { name: 'Mensagem' })).toBeVisible();
    }

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar cópia da conversa' }).click();
    expect((await download).suggestedFilename()).toBe('faisca-conversa.json');

    expect((await patient.post('/link/revoke')).status()).toBe(204);
    expect((await professional.get(thread)).status()).toBe(403);
    await page.reload();
    await expect(page.getByText(/Esta conversa não está disponível/)).toBeVisible();
    await expect(page.getByText('Horário fictício confirmado.')).toHaveCount(0);
  } finally {
    await patient.dispose();
    await professional.dispose();
  }
});
