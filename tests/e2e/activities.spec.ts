import { expect, test, type Locator, type Page } from '@playwright/test';
import { users } from '../fixtures/users.js';

// Registro de atividades no navegador, passando pelo proxy /api do Vite até a API de testes.
// Usa uma paciente semeada só para estes testes; cada teste tem atividades com nomes próprios.

async function login(page: Page, { email, password }: { email: string; password: string }) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/registros$/);
}

// Escolhe a nota pelo teclado, como no celular com leitor de tela: Home vai ao 0 e cada
// seta soma 1.
async function setScore(slider: Locator, value: number) {
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < value; i += 1) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(value));
}

test('planejar, contar como foi e ver a atividade feita na semana', async ({ page }) => {
  await login(page, users.records);

  await page.getByRole('button', { name: 'Nova atividade' }).click();
  const create = page.getByRole('dialog', { name: 'Nova atividade' });
  await create.getByLabel('O que você vai fazer (ou fez)?').fill('Caminhada no parque');
  await create.getByRole('button', { name: 'Salvar' }).click();
  await expect(create).toBeHidden();

  const card = page.getByRole('article', { name: 'Caminhada no parque' });
  await expect(card.getByText('Planejada')).toBeVisible();

  await card.getByRole('button', { name: 'Conta como foi?' }).click();
  const complete = page.getByRole('dialog', { name: 'Conta como foi?' });
  await setScore(complete.getByLabel('Vontade antes de fazer'), 2);
  await setScore(complete.getByLabel('Prazer'), 7);
  await setScore(complete.getByLabel('Realização'), 8);
  await complete.getByLabel('Quer anotar algo? (opcional)').fill('Foi melhor do que eu esperava.');
  await complete.getByRole('button', { name: 'Salvar' }).click();
  await expect(complete).toBeHidden();

  // Registro final: notas visíveis e nenhum botão (imutável).
  await expect(card.getByText('Feita')).toBeVisible();
  await expect(card.getByText('Foi melhor do que eu esperava.')).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Como foram as atividades feitas')).toBeVisible();

  // Continua lá depois de recarregar: veio da API, não do estado da tela.
  await page.reload();
  await expect(page.getByRole('article', { name: 'Caminhada no parque' }).getByText('Feita')).toBeVisible();
});

test('registrar, no dia de hoje, algo que não aconteceu', async ({ page }) => {
  await login(page, users.records);

  await page.getByRole('button', { name: 'Nova atividade' }).click();
  const create = page.getByRole('dialog', { name: 'Nova atividade' });
  await create.getByLabel('O que você vai fazer (ou fez)?').fill('Academia');
  await create.getByRole('radio', { name: /Não aconteceu/ }).check();
  await create.getByLabel('Quer anotar algo? (opcional)').fill('Fiquei sem energia.');
  await create.getByRole('button', { name: 'Salvar' }).click();
  await expect(create).toBeHidden();

  const card = page.getByRole('article', { name: 'Academia' });
  await expect(card.getByText('Não aconteceu')).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(0);
});

test('navegar para a semana anterior e voltar', async ({ page }) => {
  await login(page, users.records);

  await page.getByRole('button', { name: 'Semana anterior' }).click();
  await expect(page).toHaveURL(/\/registros\?semana=\d{4}-\d{2}-\d{2}$/);
  await page.getByRole('button', { name: 'Voltar para esta semana' }).click();
  await expect(page).toHaveURL(/\/registros$/);
});

test.describe('no celular (360px)', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('"Nova atividade" e "Salvar" ficam ao alcance, mesmo depois de rolar', async ({ page }) => {
    await login(page, users.records);

    // O botão flutua: continua na tela depois de rolar até o fim da semana.
    await page.mouse.wheel(0, 5000);
    const newActivity = page.getByRole('button', { name: 'Nova atividade' });
    await expect(newActivity).toBeInViewport();

    // O formulário mais longo ("Já fiz"): o Salvar fica visível sem rolar o painel.
    await newActivity.click();
    const create = page.getByRole('dialog', { name: 'Nova atividade' });
    await create.getByRole('radio', { name: /Já fiz/ }).check();
    await expect(create.getByRole('button', { name: 'Salvar' })).toBeInViewport();
    await expect(create.getByRole('button', { name: 'Cancelar' })).toBeInViewport();

    // Nada vaza para os lados.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  });
});
