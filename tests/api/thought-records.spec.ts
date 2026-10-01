import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Registro de Pensamentos ponta a ponta (regra 1, DEC-039): o novo aceite do aviso libera a área,
// a paciente registra, a terapeuta vinculada lê e nunca escreve, e perde o acesso ao desvincular.
// Usa as contas próprias do RPD, que começam sem o aceite da versão atual.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Data fixa e passada: não depende do dia em que o teste roda.
const DAY = '2026-03-10';

const record = {
  situationDate: DAY,
  situation: 'Situação fictícia',
  automaticThought: 'Pensamento fictício',
  beliefLevel: 7,
  emotions: [{ emotion: 'ANSIEDADE', intensity: 8 }],
  behavior: 'Comportamento fictício',
  consequence: 'Consequência fictícia',
};

test('aceite do aviso, registro da paciente e leitura só pela terapeuta vinculada', async () => {
  const patient = await loggedIn(users.rpdPatient);
  const therapist = await loggedIn(users.rpdTherapist);

  // Sem o aceite da versão atual: só a área de RPD fica fechada.
  expect((await (await patient.get('/auth/me')).json()).user.privacyUpToDate).toBe(false);
  const blocked = await patient.post('/thought-records', { data: record });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  expect((await patient.get('/appointments')).status()).toBe(200);

  expect((await patient.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const created = await patient.post('/thought-records', { data: record });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).thoughtRecord as { id: string };

  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const path = `/therapist/patients/${patientId}/thought-records`;

  // A terapeuta também precisa do aceite da versão atual.
  expect((await therapist.get(path, { params: { from: DAY, to: DAY } })).status()).toBe(403);
  expect((await therapist.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const read = await therapist.get(path, { params: { from: DAY, to: DAY } });
  expect(read.status()).toBe(200);
  expect((await read.json()).thoughtRecords).toEqual([expect.objectContaining({ id, situation: 'Situação fictícia' })]);

  // Só leitura, mesmo com vínculo ativo e aceite em dia.
  expect((await therapist.post(path, { data: record })).status()).toBe(403);
  expect((await therapist.delete(`${path}/${id}`)).status()).toBe(403);
  expect((await therapist.delete(`/thought-records/${id}`)).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect((await therapist.get(path, { params: { from: DAY, to: DAY } })).status()).toBe(403);

  await patient.dispose();
  await therapist.dispose();
});
