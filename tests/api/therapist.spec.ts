import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Visão da terapeuta ponta a ponta (regra 1): lê com vínculo ativo; nunca escreve; perde o
// acesso quando o paciente desfaz o vínculo. Usa as contas próprias do vínculo e termina sem vínculo.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Data fixa e passada: não depende do dia em que o teste roda.
const DAY = '2026-03-10';

test('terapeuta lê os registros do paciente vinculado, não escreve e perde o acesso ao desvincular', async () => {
  const patient = await loggedIn(users.linkPatient);
  const therapist = await loggedIn(users.linkTherapist);

  const created = await patient.post('/activities', {
    data: { name: 'Caminhada fictícia', activityDate: DAY, status: 'PLANEJADA' },
  });
  expect(created.status()).toBe(201);
  const { code } = await (await patient.post('/link/code')).json();
  const redeemed = await therapist.post('/links/redeem-code', { data: { code } });
  const patientId = (await redeemed.json()).patient.id as string;
  const base = `/therapist/patients/${patientId}`;

  const summary = await therapist.get(base);
  expect(summary.status()).toBe(200);
  expect((await summary.json()).patient.name).toBe('Vera Fictícia');

  const activities = await therapist.get(`${base}/activities`, { params: { from: DAY, to: DAY } });
  expect(activities.status()).toBe(200);
  expect((await activities.json()).activities).toContainEqual(expect.objectContaining({ name: 'Caminhada fictícia' }));

  // Só leitura, mesmo com vínculo ativo.
  expect((await therapist.post(`${base}/activities`, { data: { name: 'x' } })).status()).toBe(403);
  expect((await therapist.delete(`${base}/appointments`)).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect((await therapist.get(base)).status()).toBe(403);
  expect((await therapist.get(`${base}/activities`, { params: { from: DAY, to: DAY } })).status()).toBe(403);

  await patient.dispose();
  await therapist.dispose();
});

test('terapeuta sem vínculo não lê paciente nenhum: 403', async () => {
  const other = await loggedIn(users.linkPatient);
  const patientId = (await (await other.get('/auth/me')).json()).user.id as string;
  const therapist = await loggedIn(users.therapist);

  expect((await therapist.get(`/therapist/patients/${patientId}`)).status()).toBe(403);

  await other.dispose();
  await therapist.dispose();
});

test('sem sessão: leitura 401 e escrita 403', async ({ request }) => {
  const path = '/therapist/patients/00000000-0000-4000-8000-000000000001';
  expect((await request.get(path)).status()).toBe(401);
  expect((await request.post(`${path}/activities`)).status()).toBe(403);
});
