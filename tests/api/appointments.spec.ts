import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Autorização das consultas ponta a ponta (regra 1): caso permitido e casos negados.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Datas fixas e distantes: não dependem do dia em que o teste roda.
const DAY = '2030-03-12';

test('paciente cria, lista e remarca a própria consulta', async () => {
  const patient = await loggedIn(users.patient);

  const created = await patient.post('/appointments', { data: { appointmentDate: DAY } });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).appointment;

  const moved = await patient.patch(`/appointments/${id}`, { data: { appointmentDate: '2030-03-13' } });
  expect(moved.status()).toBe(200);

  const list = await patient.get('/appointments');
  expect((await list.json()).appointments).toContainEqual(
    expect.objectContaining({ id, appointmentDate: '2030-03-13' }),
  );
  await patient.dispose();
});

test('sem sessão, as rotas de consulta respondem 401', async ({ request }) => {
  expect((await request.get('/appointments')).status()).toBe(401);
});

test('conta só de terapeuta não usa o contexto de paciente: 403', async () => {
  const therapist = await loggedIn(users.therapist);

  expect((await therapist.get('/appointments')).status()).toBe(403);
  expect((await therapist.post('/appointments', { data: { appointmentDate: DAY } })).status()).toBe(403);
  await therapist.dispose();
});

test('outra paciente não vê nem altera a consulta: 403', async () => {
  const owner = await loggedIn(users.patient);
  const other = await loggedIn(users.bothProfiles);

  const created = await owner.post('/appointments', { data: { appointmentDate: '2030-04-02' } });
  const { id } = (await created.json()).appointment;

  const list = await other.get('/appointments');
  expect((await list.json()).appointments).not.toContainEqual(expect.objectContaining({ id }));
  expect((await other.patch(`/appointments/${id}`, { data: { appointmentDate: '2030-04-03' } })).status()).toBe(
    403,
  );
  expect((await other.delete(`/appointments/${id}`)).status()).toBe(403);

  const mine = await owner.get('/appointments');
  expect((await mine.json()).appointments).toContainEqual(
    expect.objectContaining({ id, appointmentDate: '2030-04-02' }),
  );
  await owner.dispose();
  await other.dispose();
});
