import { expect, test, type Browser, type Page } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Registro de Pensamentos no navegador (DEC-039, DEC-040): a paciente aceita o aviso novo, registra
// pela página própria e vê o cartão; a terapeuta vinculada aceita o aviso e lê na aba, só leitura.

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

async function acceptPrivacy(page: Page) {
  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Li e concordo/ }).check();
  await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Antes de começar' })).toBeHidden();
}

test('paciente aceita o aviso e registra; terapeuta vinculada aceita e lê na aba', async ({ browser }) => {
  const patient = await signIn(browser, users.rpdScreenPatient);

  // A faixa avisa em Atividades; a aba Pensamentos pede o aceite.
  await expect(patient.getByText(/Atualizamos o aviso de privacidade/)).toBeVisible();
  await patient.getByRole('navigation', { name: 'Registros' }).getByRole('link', { name: 'Pensamentos' }).click();
  await expect(patient).toHaveURL(/\/pensamentos$/);
  await acceptPrivacy(patient);

  // Novo registro, pela página própria.
  await patient.getByRole('link', { name: /Novo registro/ }).click();
  await expect(patient).toHaveURL(/\/pensamentos\/novo/);
  await patient.getByLabel('Situação', { exact: true }).fill('Apresentação no curso');
  await patient.getByLabel('Pensamento automático').fill('Todo mundo vai perceber que estou nervosa');
  await patient.getByLabel('O quanto acredito nesse pensamento').fill('7');
  await patient.getByRole('checkbox', { name: 'Ansiedade' }).check();
  await patient.getByLabel('Intensidade: ansiedade').fill('8');
  await patient.getByLabel('Comportamento', { exact: true }).fill('Falei rápido para acabar logo');
  await patient.getByLabel('Consequência', { exact: true }).fill('Ninguém comentou, e me senti aliviada');
  await patient.getByRole('button', { name: 'Salvar registro' }).click();

  await expect(patient).toHaveURL(/\/pensamentos$/);
  await expect(patient.getByText('Registro salvo.')).toBeVisible();
  const card = patient.getByRole('article', { name: 'Registro: Apresentação no curso' });
  await expect(card.getByText('Todo mundo vai perceber que estou nervosa')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Editar' })).toBeVisible();

  // Vínculo pela API (a tela de vínculo já tem o próprio e2e).
  const therapist = await signIn(browser, users.rpdScreenTherapist);
  const { code } = await (await patient.request.post('/api/link/code')).json();
  expect((await therapist.request.post('/api/links/redeem-code', { data: { code } })).status()).toBe(201);

  // Terapeuta: abre a paciente, vai para a aba e aceita o aviso.
  await therapist.goto('/pacientes');
  await therapist.getByRole('link', { name: /Nina Fictícia/ }).click();
  await therapist.getByRole('button', { name: 'Pensamentos' }).click();
  await expect(therapist).toHaveURL(/aba=pensamentos/);
  await acceptPrivacy(therapist);

  const read = therapist.getByRole('article', { name: 'Registro: Apresentação no curso' });
  await expect(read.getByText('Ninguém comentou, e me senti aliviada')).toBeVisible();
  await expect(read.getByText(/Registrado em/)).toBeVisible();
  await expect(read.getByRole('button')).toHaveCount(0);
  await expect(read.getByRole('link')).toHaveCount(0);

  await patient.context().close();
  await therapist.context().close();
});
