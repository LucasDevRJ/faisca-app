import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Episódios de tensão ponta a ponta (regra 1, DEC-042): o novo aceite do aviso libera a área sem
// tirar o RPD de quem já o tinha, a paciente registra, a terapeuta vinculada lê e nunca escreve, e
// perde o acesso ao desvincular. Usa as contas próprias, que só aceitaram a versão do RPD.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Data fixa e passada: não depende do dia em que o teste roda.
const DAY = '2026-03-10';
const params = { from: DAY, to: DAY };

const episode = {
  episodeDate: DAY,
  episodeTime: '19:20',
  situation: 'Situação fictícia',
  tensionLevel: 8,
  vocalizeUrge: 6,
  behavior: 'Comportamento fictício',
  consequence: 'Consequência fictícia',
};

test('aceite por área, registro da paciente e leitura só pela terapeuta vinculada', async () => {
  const patient = await loggedIn(users.tensionPatient);
  const therapist = await loggedIn(users.tensionTherapist);

  // Com a versão do RPD: o RPD segue aberto, e só os episódios ficam fechados.
  const me = (await (await patient.get('/auth/me')).json()).user;
  expect(me.privacyAreas).toEqual({
    thoughtRecords: true,
    tensionEpisodes: false,
    appointmentSchedule: false,
    actions: false,
  });
  expect((await patient.get('/thought-records', { params })).status()).toBe(200);
  const blocked = await patient.post('/tension-episodes', { data: episode });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('PRIVACY_CONSENT_REQUIRED');

  expect((await patient.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const created = await patient.post('/tension-episodes', { data: episode });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()).tensionEpisode as { id: string };

  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const path = `/therapist/patients/${patientId}/tension-episodes`;

  // A terapeuta também precisa do aceite da versão que cita os episódios; o RPD dela segue aberto.
  expect((await therapist.get(path, { params })).status()).toBe(403);
  expect((await therapist.get(`/therapist/patients/${patientId}/thought-records`, { params })).status()).toBe(200);
  expect((await therapist.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const read = await therapist.get(path, { params });
  expect(read.status()).toBe(200);
  expect((await read.json()).tensionEpisodes).toEqual([
    expect.objectContaining({ id, episodeTime: '19:20', tensionLevel: 8, vocalizeUrge: 6 }),
  ]);

  // Só leitura, mesmo com vínculo ativo e aceite em dia.
  expect((await therapist.post(path, { data: episode })).status()).toBe(403);
  expect((await therapist.patch(`${path}/${id}`, { data: { tensionLevel: 0 } })).status()).toBe(403);
  expect((await therapist.delete(`${path}/${id}`)).status()).toBe(403);
  expect((await therapist.delete(`/tension-episodes/${id}`)).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect((await therapist.get(path, { params })).status()).toBe(403);

  await patient.dispose();
  await therapist.dispose();
});
