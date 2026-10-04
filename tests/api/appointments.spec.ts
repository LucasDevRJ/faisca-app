import { expect, request as playwrightRequest, test } from '@playwright/test';
import { API_URL } from '../fixtures/urls.js';
import { users } from '../fixtures/users.js';

// Agenda ponta a ponta (regra 1, DEC-045): o aceite da versão que cita a agenda libera a escrita,
// a paciente agenda, desmarca e pausa, a terapeuta vinculada lê com os motivos e nunca escreve.
// Usa as contas próprias, que só aceitaram a versão dos episódios de tensão.

type Credentials = (typeof users)[keyof typeof users];

async function loggedIn(who: Credentials) {
  const context = await playwrightRequest.newContext({ baseURL: API_URL });
  const login = await context.post('/auth/login', { data: who });
  expect(login.status()).toBe(200);
  return context;
}

// Datas a partir de amanhã, no fuso de São Paulo: a agenda só aceita até 365 dias à frente.
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const day = (offset: number) =>
  new Date(new Date(`${today}T00:00:00Z`).getTime() + offset * 86_400_000).toISOString().slice(0, 10);

type Session = { date: string; status: string; reason: string | null };

test('aceite, agenda da paciente e leitura só pela terapeuta vinculada', async () => {
  const patient = await loggedIn(users.agendaPatient);
  const therapist = await loggedIn(users.agendaTherapist);
  const schedule = { startDate: day(1), time: '14:00', frequency: 'SEMANAL' };

  // Sem o aceite da 2026-10.4: lê, mas não grava.
  expect((await patient.get('/appointments')).status()).toBe(200);
  const blocked = await patient.put('/appointments/schedule', { data: schedule });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe('PRIVACY_CONSENT_REQUIRED');

  expect((await patient.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const created = await patient.put('/appointments/schedule', { data: schedule });
  expect(created.status()).toBe(200);
  expect((await created.json()).next.date).toBe(day(1));

  const cancelled = await patient.post(`/appointments/sessions/${day(8)}/cancel`, { data: { reason: 'Motivo fictício' } });
  expect(cancelled.status()).toBe(200);
  const paused = await patient.post('/appointments/pause', { data: { startDate: day(20), returnDate: day(40) } });
  expect(paused.status()).toBe(200);

  const { code } = await (await patient.post('/link/code')).json();
  const patientId = (await (await therapist.post('/links/redeem-code', { data: { code } })).json()).patient.id as string;
  const base = `/therapist/patients/${patientId}`;

  // A terapeuta também precisa do aceite para ler a agenda com os motivos; o resumo segue aberto.
  expect((await therapist.get(`${base}/appointments`)).status()).toBe(403);
  const summary = await therapist.get(base);
  expect(summary.status()).toBe(200);
  expect((await summary.json()).agendaStatus).toBe('ATIVA');

  expect((await therapist.post('/auth/accept-privacy', { data: { acceptPrivacy: true } })).status()).toBe(200);
  const read = await therapist.get(`${base}/appointments`);
  expect(read.status()).toBe(200);
  const body = await read.json();
  expect(body.pause).toEqual({ startDate: day(20), returnDate: day(40) });
  expect(body.upcoming as Session[]).toContainEqual(
    expect.objectContaining({ date: day(8), status: 'DESMARCADA', reason: 'Motivo fictício' }),
  );

  // Pela porta da terapeuta, nenhuma escrita na agenda: 403 antes de tudo.
  for (const res of [
    await therapist.put(`${base}/appointments/schedule`, { data: schedule }),
    await therapist.post(`${base}/appointments/pause/resume`),
    await therapist.delete(`${base}/appointments/sessions/${day(8)}/change`),
  ]) {
    expect(res.status()).toBe(403);
  }
  // E pelas rotas da paciente, a conta de terapeuta não entra.
  expect((await therapist.post('/appointments/schedule/end')).status()).toBe(403);

  // Ciclo da consulta (DEC-049): a paciente e a terapeuta vinculada leem o mesmo período.
  const myCycle = (await (await patient.get('/appointments/cycle')).json()).cycle;
  expect(myCycle).toEqual(expect.objectContaining({ from: day(-5), to: day(1) }));
  const theirCycle = await therapist.get(`${base}/cycle`);
  expect(theirCycle.status()).toBe(200);
  expect((await theirCycle.json()).cycle).toEqual(myCycle);
  expect((await therapist.post(`${base}/cycle`)).status()).toBe(403);

  const mine = await (await patient.get('/appointments')).json();
  expect(mine.status).toBe('ATIVA');
  expect(mine.pause).toEqual({ startDate: day(20), returnDate: day(40) });

  await patient.dispose();
  await therapist.dispose();
});

test('sem sessão, as rotas da agenda respondem 401', async ({ request }) => {
  expect((await request.get('/appointments')).status()).toBe(401);
  expect((await request.put('/appointments/schedule', { data: {} })).status()).toBe(401);
  expect((await request.get('/appointments/calendar.ics')).status()).toBe(401);
});

test('outra paciente não vê nem altera a agenda: lista vazia e 404 na sessão', async () => {
  const other = await loggedIn(users.bothProfiles);

  const list = await (await other.get('/appointments')).json();
  expect((list.sessions as Session[]).some((s) => s.reason === 'Motivo fictício')).toBe(false);
  // A sessão é procurada só na agenda de quem está logado.
  const cancel = await other.post(`/appointments/sessions/${day(1)}/cancel`, { data: { reason: 'Invasão' } });
  expect([403, 404]).toContain(cancel.status());
  await other.dispose();
});
