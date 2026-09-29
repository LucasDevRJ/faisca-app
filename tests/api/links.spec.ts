import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Vínculo ponta a ponta (regra 1): quem pode criar, ver e desfazer, e os casos negados.
// Usa contas próprias (linkPatient, linkTherapist) e termina sempre sem vínculo ativo.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

test('paciente gera código, terapeuta vincula e o paciente revoga', async () => {
  const patient = await loggedIn(users.linkPatient);
  const therapist = await loggedIn(users.linkTherapist);

  const generated = await patient.post('/link/code');
  expect(generated.status()).toBe(201);
  const { code } = await generated.json();

  const redeemed = await therapist.post('/links/redeem-code', { data: { code } });
  expect(redeemed.status()).toBe(201);
  expect((await redeemed.json()).patient).toEqual(
    expect.objectContaining({ name: 'Vera Fictícia', email: users.linkPatient.email }),
  );

  const status = await (await patient.get('/link')).json();
  expect(status.link.therapist).toEqual({ name: 'Tina Fictícia', email: users.linkTherapist.email });

  const list = await (await therapist.get('/links/patients')).json();
  expect(list.patients).toContainEqual(expect.objectContaining({ email: users.linkPatient.email }));

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  const afterRevoke = await (await therapist.get('/links/patients')).json();
  expect(afterRevoke.patients).not.toContainEqual(expect.objectContaining({ email: users.linkPatient.email }));

  await patient.dispose();
  await therapist.dispose();
});

test('sem sessão, as rotas de vínculo respondem 401', async ({ request }) => {
  expect((await request.get('/link')).status()).toBe(401);
  expect((await request.post('/link/code')).status()).toBe(401);
  expect((await request.post('/links/redeem-code', { data: { code: 'K7M4-P9QX' } })).status()).toBe(401);
  expect((await request.get('/links/patients')).status()).toBe(401);
});

test('terapeuta não usa as rotas do paciente, e paciente não resgata código: 403', async () => {
  const therapist = await loggedIn(users.linkTherapist);
  const patient = await loggedIn(users.linkPatient);

  expect((await therapist.get('/link')).status()).toBe(403);
  expect((await therapist.post('/link/code')).status()).toBe(403);
  expect((await patient.post('/links/redeem-code', { data: { code: 'K7M4-P9QX' } })).status()).toBe(403);
  expect((await patient.get('/links/patients')).status()).toBe(403);

  await therapist.dispose();
  await patient.dispose();
});

test('código usado não vale de novo', async () => {
  const patient = await loggedIn(users.linkPatient);
  const therapist = await loggedIn(users.linkTherapist);
  const other = await loggedIn(users.bothProfiles);

  const { code } = await (await patient.post('/link/code')).json();
  expect((await therapist.post('/links/redeem-code', { data: { code } })).status()).toBe(201);
  expect((await patient.post('/link/revoke')).status()).toBe(204);

  const again = await other.post('/links/redeem-code', { data: { code } });
  expect(again.status()).toBe(400);

  await patient.dispose();
  await therapist.dispose();
  await other.dispose();
});
