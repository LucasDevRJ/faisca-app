import { expect, test, type Browser, type Page } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Vínculo por código no navegador, com duas pessoas em janelas separadas (DEC-032):
// o paciente gera, a terapeuta digita, o paciente vê o aviso e desfaz o vínculo.

type Credentials = (typeof users)[keyof typeof users];

async function signIn(browser: Browser, who: Credentials): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Senha', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).not.toHaveURL(/\/entrar/);
  return page;
}

test('paciente gera o código, terapeuta vincula, paciente vê o aviso e desfaz', async ({ browser }) => {
  const patient = await signIn(browser, users.linkPatient);
  const therapist = await signIn(browser, users.linkTherapist);

  // Paciente: Conta → Gerar código.
  await patient.getByRole('link', { name: 'Conta' }).click();
  const section = patient.getByRole('region', { name: 'Minha terapeuta' });
  await section.getByRole('button', { name: 'Gerar código' }).click();
  const code = (await section.getByText(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/).textContent()) ?? '';
  expect(code).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);

  // Terapeuta: Meus pacientes → digita o código (em minúsculas, como alguém digitaria).
  await expect(therapist).toHaveURL(/\/pacientes$/);
  await therapist.getByLabel('Código do paciente').fill(code.toLowerCase());
  await therapist.getByRole('button', { name: 'Vincular' }).click();
  await expect(therapist.getByText(/Agora você acompanha os registros de Vera Fictícia/)).toBeVisible();
  await expect(therapist.getByRole('listitem').filter({ hasText: 'Vera Fictícia' })).toBeVisible();

  // Paciente: o aviso aparece em Meus registros até tocar em "Entendi".
  await patient.goto('/registros');
  const notice = patient.getByRole('region', { name: 'Novo vínculo' });
  await expect(notice).toContainText('Tina Fictícia');
  await expect(notice).toContainText(users.linkTherapist.email);
  await notice.getByRole('button', { name: 'Entendi' }).click();
  await expect(notice).toBeHidden();

  // Paciente: desfaz em Conta, com confirmação.
  await patient.getByRole('link', { name: 'Conta' }).click();
  await patient.getByRole('button', { name: 'Desfazer vínculo' }).click();
  await patient.getByRole('dialog', { name: 'Desfazer o vínculo?' }).getByRole('button', { name: 'Desfazer' }).click();
  await expect(section.getByRole('button', { name: 'Gerar código' })).toBeVisible();

  // Terapeuta: o paciente sai da lista.
  await therapist.reload();
  await expect(therapist.getByText(/Ninguém por aqui ainda/)).toBeVisible();

  await patient.context().close();
  await therapist.context().close();
});
