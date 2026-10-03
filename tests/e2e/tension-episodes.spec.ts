import { expect, test, type Browser, type Page } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Episódios de tensão no navegador (DEC-042, DEC-043): a paciente, que já usava o RPD, aceita o
// aviso novo só para a Tensão, registra pela página própria e vê o cartão e o gráfico; a terapeuta
// vinculada aceita o aviso e lê na aba, só leitura.

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

test('paciente aceita o aviso e registra; terapeuta vinculada aceita e lê na aba, com o gráfico', async ({
  browser,
}) => {
  // Duas pessoas, aceite, formulário e gráfico num teste só: passa dos 30 s padrão em máquina lenta.
  test.slow();
  const patient = await signIn(browser, users.tensionScreenPatient);
  const tabs = patient.getByRole('navigation', { name: 'Registros' });

  // Com a versão do RPD: Pensamentos aberto, e a faixa fala só dos episódios.
  await expect(patient.getByText(/para incluir os Episódios de tensão/)).toBeVisible();
  await tabs.getByRole('link', { name: 'Pensamentos' }).click();
  await expect(patient.getByRole('heading', { name: 'Antes de começar' })).toBeHidden();
  await tabs.getByRole('link', { name: 'Tensão' }).click();
  await expect(patient).toHaveURL(/\/tensao$/);
  await acceptPrivacy(patient);

  // Novo episódio, pela página própria, sem hora (a hora é opcional).
  await patient.getByRole('link', { name: /Novo episódio/ }).click();
  await expect(patient).toHaveURL(/\/tensao\/novo/);
  await patient.getByLabel('O que estava acontecendo?').fill('Fila longa no banco');
  await patient.getByLabel('Tensão', { exact: true }).fill('7');
  // Não 5: sem nota escolhida, o polegar já fica no 5, e o fill não dispararia mudança.
  await patient.getByLabel('Vontade de vocalizar').fill('4');
  await patient.getByLabel('O que você fez?').fill('Respirei contando até quatro');
  await patient.getByLabel('O que aconteceu depois?').fill('A tensão diminuiu');
  await patient.getByRole('button', { name: 'Salvar episódio' }).click();

  await expect(patient).toHaveURL(/\/tensao$/);
  await expect(patient.getByText('Registro salvo.')).toBeVisible();
  const card = patient.getByRole('article', { name: 'Episódio: Fila longa no banco' });
  await expect(card.getByText('sem horário')).toBeVisible();
  await expect(card.getByRole('link', { name: 'Editar' })).toBeVisible();
  await expect(patient.getByRole('heading', { name: 'Tensão e vontade de vocalizar' })).toBeVisible();

  // Vínculo pela API (a tela de vínculo já tem o próprio e2e).
  const therapist = await signIn(browser, users.tensionScreenTherapist);
  const { code } = await (await patient.request.post('/api/link/code')).json();
  expect((await therapist.request.post('/api/links/redeem-code', { data: { code } })).status()).toBe(201);

  // Terapeuta: abre a paciente, vai para a aba e aceita o aviso.
  await therapist.goto('/pacientes');
  await therapist.getByRole('link', { name: /Duda Fictícia/ }).click();
  await therapist.getByRole('button', { name: 'Tensão' }).click();
  await expect(therapist).toHaveURL(/aba=tensao/);
  await acceptPrivacy(therapist);

  await expect(therapist.getByRole('heading', { name: 'Tensão e vontade de vocalizar' })).toBeVisible();
  const read = therapist.getByRole('article', { name: 'Episódio: Fila longa no banco' });
  await expect(read.getByText('A tensão diminuiu')).toBeVisible();
  await expect(read.getByText(/Registrado em/)).toBeVisible();
  await expect(read.getByRole('button')).toHaveCount(0);
  await expect(read.getByRole('link')).toHaveCount(0);

  await patient.context().close();
  await therapist.context().close();
});
