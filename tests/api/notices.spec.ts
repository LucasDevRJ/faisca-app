import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Mural de avisos ponta a ponta (DEC-079): a terapeuta publica; o paciente vinculado lê e marca como
// visto; outra terapeuta não mexe no aviso; ao desfazer o vínculo, o paciente deixa de ver.
// Usa as contas próprias do mural e termina sem vínculo.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

test('a terapeuta publica, o paciente vinculado lê e marca como visto, e perde o acesso ao desvincular', async () => {
  const patient = await loggedIn(users.noticesPatient);
  const therapist = await loggedIn(users.noticesTherapist);
  const otherTherapist = await loggedIn(users.therapist);

  // Publicado antes do vínculo: o paciente vê do mesmo jeito.
  const created = await therapist.post('/therapist/notices', { data: { body: 'Estarei de férias de 10 a 20 (fictício).' } });
  expect(created.status()).toBe(201);
  const noticeId = (await created.json()).notice.id as string;

  // Sem vínculo, nada.
  expect(await (await patient.get('/notices')).json()).toEqual({ notices: [], unseenCount: 0 });

  const { code } = await (await patient.post('/link/code')).json();
  expect((await therapist.post('/links/redeem-code', { data: { code } })).status()).toBe(201);

  const list = await (await patient.get('/notices')).json();
  expect(list.unseenCount).toBe(1);
  expect(list.notices[0]).toMatchObject({ id: noticeId, body: 'Estarei de férias de 10 a 20 (fictício).', seen: false });

  const seen = await patient.put('/notices/seen', { data: { ids: [noticeId] } });
  expect(seen.status()).toBe(200);
  expect((await seen.json()).unseenCount).toBe(0);

  // Outra terapeuta não edita nem apaga; o paciente não publica.
  expect((await otherTherapist.patch(`/therapist/notices/${noticeId}`, { data: { body: 'x' } })).status()).toBe(403);
  expect((await otherTherapist.delete(`/therapist/notices/${noticeId}`)).status()).toBe(403);
  expect((await patient.post('/therapist/notices', { data: { body: 'x' } })).status()).toBe(403);

  expect((await patient.post('/link/revoke')).status()).toBe(204);
  expect(await (await patient.get('/notices')).json()).toEqual({ notices: [], unseenCount: 0 });

  expect((await therapist.delete(`/therapist/notices/${noticeId}`)).status()).toBe(204);

  await patient.dispose();
  await therapist.dispose();
  await otherTherapist.dispose();
});
