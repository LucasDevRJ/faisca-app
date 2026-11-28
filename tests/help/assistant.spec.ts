import { expect, test } from '@playwright/test';
import { users } from '../fixtures/users.js';

for (const [name, account] of [['paciente', users.helpPatient], ['profissional', users.helpProfessional]] as const) {
  test(`ajuda com aceite e fontes para ${name} no celular e no computador`, async ({ page }) => {
    expect((await page.request.post('/api/auth/login', { data: account })).status()).toBe(200);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/como-funciona');
      await page.getByRole('textbox', { name: 'Sua dúvida sobre o aplicativo' }).fill('Como ligar dois registros?');
      const send = page.getByRole('button', { name: 'Enviar pergunta' });
      await expect(send).toBeDisabled();
      await page.getByRole('checkbox', { name: /autorizo enviar esta pergunta/ }).check();
      await send.click();
      await expect(page.getByRole('heading', { name: 'Orientações do guia encontradas com IA' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link')).toHaveAttribute('href', '/como-funciona#buscar-ligar');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.getByRole('navigation', { name: 'Fontes da resposta' }).getByRole('link').click();
      await expect(page).toHaveURL(/#buscar-ligar$/);
      await expect(page.locator('#buscar-ligar')).toBeFocused();
      await page.getByRole('button', { name: 'Limpar pergunta e resposta' }).click();
      await expect(page.getByRole('textbox')).toHaveValue('');
    }
  });
}
