import { expect, test, type Browser, type Page } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Vínculo por código no navegador, com duas pessoas em janelas separadas (DEC-032):
// o paciente gera, a terapeuta digita e vê os registros (DEC-033), o paciente vê o aviso e
// desfaz o vínculo, e a terapeuta perde o acesso.

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

// O dia de hoje em São Paulo, no formato da API.
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

test('paciente gera o código, terapeuta vincula e lê os registros, paciente desfaz e o acesso cai', async ({
  browser,
}) => {
  const patient = await signIn(browser, users.linkPatient);
  const therapist = await signIn(browser, users.linkTherapist);

  // Paciente: uma atividade de hoje, direto pela API (a tela de registro já tem o próprio e2e).
  const created = await patient.request.post('/api/activities', {
    data: { name: 'Leitura no fim de tarde', activityDate: todayInSaoPaulo(), status: 'PLANEJADA' },
  });
  expect(created.status()).toBe(201);

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

  // Terapeuta: abre os registros da paciente. Só leitura: o card não tem nenhum botão.
  await therapist.getByRole('link', { name: /Vera Fictícia/ }).click();
  await expect(therapist).toHaveURL(/\/pacientes\/[0-9a-f-]{36}$/);
  const patientUrl = therapist.url();
  await expect(therapist.getByRole('heading', { level: 1, name: 'Vera Fictícia' })).toBeVisible();
  await expect(therapist.getByText(/Em destaque:/)).toBeVisible();
  const card = therapist.getByRole('article', { name: 'Leitura no fim de tarde' });
  await expect(card.getByText(/Registrado em/)).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);

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

  // Terapeuta: os registros ficam indisponíveis e o paciente sai da lista.
  await therapist.goto(patientUrl);
  await expect(therapist.getByRole('heading', { name: 'Registros indisponíveis' })).toBeVisible();
  await therapist.getByRole('link', { name: 'Voltar para Meus pacientes' }).click();
  await expect(therapist.getByText(/Ninguém por aqui ainda/)).toBeVisible();

  await patient.context().close();
  await therapist.context().close();
});
