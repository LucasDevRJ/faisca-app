import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Fotos da Ação ponta a ponta (DEC-064, regra 1): a terapeuta vinculada vê, não escreve e perde o
// acesso ao desvincular. Usa as contas próprias das fotos e termina sem vínculo.

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

// O que já foi feito precisa ser dos últimos 7 dias (DEC-051): hoje, em São Paulo.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

test('a terapeuta vê as fotos da Ação do paciente vinculado, não escreve e perde o acesso ao desvincular', async () => {
  const patient = await loggedIn(users.photosPatient);
  const therapist = await loggedIn(users.photosTherapist);
  const unlinked = await loggedIn(users.therapist);

  const created = await patient.post('/actions', {
    data: { status: 'AVALIADA', actionDate: today, name: 'Passeio fictício', category: 'CONEXAO', expectation: 5, pleasure: 8, achievement: 6 },
  });
  expect(created.status()).toBe(201);
  const actionId = (await created.json()).action.id as string;
  const uploaded = await patient.post(`/actions/${actionId}/photos`, { headers: { 'Content-Type': 'image/png' }, data: PNG });
  expect(uploaded.status()).toBe(201);
  const photoId = (await uploaded.json()).photo.id as string;

  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const path = `/therapist/patients/${patientId}/actions/${actionId}/photos/${photoId}`;

  const photo = await therapist.get(path);
  expect(photo.status()).toBe(200);
  expect(photo.headers()['content-type']).toBe('image/webp');
  expect((await unlinked.get(path)).status()).toBe(403);
  expect((await therapist.delete(path)).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect((await therapist.get(path)).status()).toBe(403);
});
