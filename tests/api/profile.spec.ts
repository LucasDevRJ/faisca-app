import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Foto de perfil ponta a ponta (DEC-061, regra 1): a terapeuta vê a foto do paciente só com
// vínculo ativo e nunca a altera. Usa as contas próprias do perfil e termina sem vínculo.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Uma imagem PNG fictícia de 1×1 pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

test('a terapeuta vê a foto do paciente vinculado, não a altera e perde o acesso ao desvincular', async () => {
  const patient = await loggedIn(users.profilePatient);
  const therapist = await loggedIn(users.profileTherapist);
  const unlinked = await loggedIn(users.therapist);

  const uploaded = await patient.put('/profile/avatar', { headers: { 'Content-Type': 'image/png' }, data: PNG });
  expect(uploaded.status()).toBe(200);
  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const path = `/therapist/patients/${patientId}/avatar`;

  const photo = await therapist.get(path);
  expect(photo.status()).toBe(200);
  expect(photo.headers()['content-type']).toBe('image/webp');
  expect((await unlinked.get(path)).status()).toBe(403);
  expect((await therapist.put(path, { headers: { 'Content-Type': 'image/png' }, data: PNG })).status()).toBe(403);
  expect((await therapist.delete(path)).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect((await therapist.get(path)).status()).toBe(403);
});
