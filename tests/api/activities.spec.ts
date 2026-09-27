import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Autorização das atividades ponta a ponta (regra 1): caso permitido e casos negados.
// Cada pessoa usa um contexto de request próprio, com o próprio cookie de sessão.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Data fixa no passado: não depende do dia em que o teste roda.
const DAY = '2026-09-21';

test('paciente cria, conclui e lista a própria atividade', async () => {
  const patient = await loggedIn(users.patient);

  const created = await patient.post('/activities', {
    data: { status: 'PENDENTE', name: 'Caminhada fictícia', activityDate: DAY, wantBefore: 3 },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).activity;

  const done = await patient.post(`/activities/${id}/complete`, { data: { pleasure: 7, achievement: 8 } });
  expect(done.status()).toBe(200);

  const list = await patient.get('/activities', { params: { from: DAY, to: DAY } });
  expect(list.status()).toBe(200);
  expect((await list.json()).activities).toContainEqual(
    expect.objectContaining({ id, status: 'CONCLUIDA', pleasure: 7, achievement: 8 }),
  );

  // Registro final é imutável (regra 2).
  const edit = await patient.patch(`/activities/${id}`, { data: { name: 'Outro nome' } });
  expect(edit.status()).toBe(409);

  await patient.dispose();
});

test('sem sessão, as rotas de atividade respondem 401', async ({ request }) => {
  const res = await request.get('/activities', { params: { from: DAY, to: DAY } });

  expect(res.status()).toBe(401);
});

test('conta só de terapeuta não usa o contexto de paciente: 403', async () => {
  const therapist = await loggedIn(users.therapist);

  const list = await therapist.get('/activities', { params: { from: DAY, to: DAY } });
  const create = await therapist.post('/activities', {
    data: { status: 'PLANEJADA', name: 'Leitura', activityDate: DAY },
  });

  expect(list.status()).toBe(403);
  expect(create.status()).toBe(403);
  await therapist.dispose();
});

test('outra paciente não vê nem altera a atividade: 403', async () => {
  const owner = await loggedIn(users.patient);
  const other = await loggedIn(users.bothProfiles);

  const created = await owner.post('/activities', {
    data: { status: 'PLANEJADA', name: 'Atividade da dona', activityDate: DAY },
  });
  const { id } = (await created.json()).activity;

  const list = await other.get('/activities', { params: { from: DAY, to: DAY } });
  expect((await list.json()).activities).not.toContainEqual(expect.objectContaining({ id }));

  for (const res of [
    await other.patch(`/activities/${id}`, { data: { name: 'Invadido' } }),
    await other.post(`/activities/${id}/start`, { data: { wantBefore: 1 } }),
    await other.post(`/activities/${id}/not-done`),
    await other.delete(`/activities/${id}`),
  ]) {
    expect(res.status()).toBe(403);
  }

  // Nada mudou para a dona.
  const mine = await owner.get('/activities', { params: { from: DAY, to: DAY } });
  expect((await mine.json()).activities).toContainEqual(
    expect.objectContaining({ id, name: 'Atividade da dona', status: 'PLANEJADA' }),
  );
  await owner.dispose();
  await other.dispose();
});
