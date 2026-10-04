import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Ação ponta a ponta (regra 1, DEC-051): o aceite da versão que cita a Ação libera a área, a
// paciente planeja e avalia, a terapeuta vinculada lê e nunca escreve. Usa as contas próprias, que
// só aceitaram a versão da agenda.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Hoje, no fuso de São Paulo: planejar vai de hoje até 7 dias à frente.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const params = { from: today, to: today };

test('aceite, ação da paciente e leitura só pela terapeuta vinculada', async () => {
  const patient = await loggedIn(users.actionPatient);
  const therapist = await loggedIn(users.actionTherapist);
  const action = { status: 'PLANEJADA', actionDate: today, name: 'Ligar para uma amiga', category: 'CONEXAO', expectation: 3 };

  const blocked = await patient.post('/actions', { data: action });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('PRIVACY_CONSENT_REQUIRED');

  expect((await patient.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const created = await patient.post('/actions', { data: action });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).action as { id: string };
  const evaluated = await patient.post(`/actions/${id}/evaluate`, { data: { pleasure: 7, achievement: 6 } });
  expect(evaluated.status()).toBe(200);

  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const path = `/therapist/patients/${patientId}/actions`;

  // A terapeuta também precisa do aceite da versão que cita a Ação.
  expect((await therapist.get(path, { params })).status()).toBe(403);
  expect((await therapist.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const read = await therapist.get(path, { params });
  expect(read.status()).toBe(200);
  expect((await read.json()).actions).toEqual([
    expect.objectContaining({ id, status: 'AVALIADA', expectation: 3, pleasure: 7, achievement: 6 }),
  ]);

  // Escrita pela porta da terapeuta: 403 antes de tudo. Pelas rotas da paciente: 403 de perfil.
  expect((await therapist.post(path, { data: action })).status()).toBe(403);
  expect((await therapist.post('/actions', { data: action })).status()).toBe(403);

  await patient.dispose();
  await therapist.dispose();
});

test('sem sessão, as rotas da Ação respondem 401', async ({ request }) => {
  expect((await request.get('/actions', { params })).status()).toBe(401);
  expect((await request.post('/actions', { data: {} })).status()).toBe(401);
});
