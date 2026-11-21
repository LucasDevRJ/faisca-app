import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, timeOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { sleepMinutes } from './daily-check-ins.service.js';

// Sono, humor e remédio (DEC-107). Dados fictícios (regra 5). As datas partem de hoje, porque só os
// últimos 7 dias aceitam registro.
const VERSION = '2026-11.7';
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherId: string;
let therapistId: string;
let today: string;

const full = {
  bedTime: '23:30',
  wakeTime: '07:00',
  sleepQuality: 6,
  mood: 7,
  moodWord: 'tranquilo',
  medication: 'TOMOU',
};

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  today = todayInAppZone();
  patientId = (await createConfirmedUser({ privacyVersion: VERSION })).id;
  otherId = (await createConfirmedUser({ email: 'outra@faisca.test', privacyVersion: VERSION })).id;
  therapistId = (
    await createConfirmedUser({
      email: 'psiquiatra@faisca.test',
      patient: false,
      therapist: true,
      privacyVersion: VERSION,
      professionalKind: 'PSIQUIATRIA',
    })
  ).id;
  await createConfirmedUser({ email: 'sem-vinculo@faisca.test', patient: false, therapist: true, privacyVersion: VERSION });
  await createConfirmedUser({ email: 'sem-aceite@faisca.test', privacyVersion: '2026-11.6' });
});

async function login(email = 'paciente@faisca.test') {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: 'senha-ficticia-123' })).status).toBe(200);
  return agent;
}

async function seed(userId: string, date: string, data: Partial<{ mood: number; medication: 'TOMOU' | 'ESQUECEU_ALGUM' | 'NAO_TOMOU'; bed: string; wake: string; sleepQuality: number; moodWord: string }>) {
  return prisma.dailyCheckIn.create({
    data: {
      userId,
      checkInDate: dateOnlyToDate(date),
      bedTime: data.bed ? timeOnlyToDate(data.bed) : null,
      wakeTime: data.wake ? timeOnlyToDate(data.wake) : null,
      sleepQuality: data.sleepQuality ?? null,
      mood: data.mood ?? null,
      moodWord: data.moodWord ?? null,
      medication: data.medication ?? null,
    },
  });
}

const range = () => `from=${addDays(today, -13)}&to=${today}`;

describe('horas de sono', () => {
  it('a noite que passa da meia-noite conta até o dia em que acordou', () => {
    expect(sleepMinutes('23:30', '07:00')).toBe(450);
    expect(sleepMinutes('01:00', '09:15')).toBe(495);
    expect(sleepMinutes('22:00', '21:00')).toBe(23 * 60);
  });
});

describe('paciente: registrar o dia', () => {
  it('registra, lê e troca o registro do dia (um por dia)', async () => {
    const agent = await login();
    const saved = await agent.put(`/daily-check-ins/${today}`).send(full);
    expect(saved.status).toBe(200);
    expect(saved.body.checkIn).toEqual({
      date: today,
      ...full,
      sleepMinutes: 450,
      editable: true,
    });

    // PUT do dia inteiro: o que não vem fica vazio.
    const changed = await agent.put(`/daily-check-ins/${today}`).send({ mood: 4 });
    expect(changed.body.checkIn).toMatchObject({ mood: 4, bedTime: null, sleepMinutes: null, medication: null });
    expect(await prisma.dailyCheckIn.count({ where: { userId: patientId } })).toBe(1);

    const list = await agent.get(`/daily-check-ins?${range()}`);
    expect(list.status).toBe(200);
    expect(list.body).toEqual({ checkIns: [expect.objectContaining({ date: today, mood: 4 })], tracksMedication: false });
    expect(list.body.checkIns[0]).not.toHaveProperty('userId');
  });

  it('só os últimos 7 dias: o 7º dia para trás e o futuro não', async () => {
    const agent = await login();
    expect((await agent.put(`/daily-check-ins/${addDays(today, -6)}`).send({ mood: 5 })).status).toBe(200);
    const old = await agent.put(`/daily-check-ins/${addDays(today, -7)}`).send({ mood: 5 });
    expect(old.status).toBe(409);
    expect(old.body.error.code).toBe('CHECK_IN_CLOSED');
    const future = await agent.put(`/daily-check-ins/${addDays(today, 1)}`).send({ mood: 5 });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('CHECK_IN_FUTURE');

    // Um registro antigo aparece, mas não pode ser apagado.
    await seed(patientId, addDays(today, -8), { mood: 3 });
    const list = await agent.get(`/daily-check-ins?${range()}`);
    expect(list.body.checkIns.find((c: { date: string }) => c.date === addDays(today, -8)).editable).toBe(false);
    expect((await agent.delete(`/daily-check-ins/${addDays(today, -8)}`)).status).toBe(409);
  });

  it('valida as respostas', async () => {
    const agent = await login();
    const cases: Record<string, unknown>[] = [
      {},
      { bedTime: '23:00' },
      { bedTime: '23:00', wakeTime: '23:00' },
      { bedTime: '25:00', wakeTime: '07:00' },
      { mood: 11 },
      { sleepQuality: -1 },
      { mood: 6.5 },
      { moodWord: 'x'.repeat(121) },
      { moodWord: 'a\u0000' },
      { moodWord: 'linha\nquebrada' },
      { medication: 'TALVEZ' },
      { mood: 5, userId: otherId },
      { mood: 5, patientId: otherId },
    ];
    for (const body of cases) {
      expect((await agent.put(`/daily-check-ins/${today}`).send(body)).status, JSON.stringify(body)).toBe(400);
    }
    // Palavra só com espaços vira vazia, e sozinha não conta como resposta.
    expect((await agent.put(`/daily-check-ins/${today}`).send({ moodWord: '   ' })).status).toBe(400);
    expect((await agent.put(`/daily-check-ins/${today}`).send({ moodWord: 'x'.repeat(120) })).status).toBe(200);
    expect(await prisma.dailyCheckIn.count({ where: { userId: otherId } })).toBe(0);
  });

  it('apaga o próprio dia; dia sem registro é 404', async () => {
    const agent = await login();
    await seed(patientId, today, { mood: 5 });
    expect((await agent.delete(`/daily-check-ins/${today}`)).status).toBe(204);
    expect((await agent.delete(`/daily-check-ins/${today}`)).status).toBe(404);
  });

  it('liga e desliga a pergunta do remédio', async () => {
    const agent = await login();
    expect((await agent.put('/daily-check-ins/settings').send({ tracksMedication: true })).body).toEqual({
      tracksMedication: true,
    });
    expect((await agent.get(`/daily-check-ins?${range()}`)).body.tracksMedication).toBe(true);
    expect((await agent.put('/daily-check-ins/settings').send({ tracksMedication: 'sim' })).status).toBe(400);
  });

  it('o banco recusa o que o Zod recusa (CHECK)', async () => {
    await expect(seed(patientId, today, {})).rejects.toThrow();
    await expect(seed(patientId, today, { mood: 11 })).rejects.toThrow();
    await expect(seed(patientId, today, { bed: '23:00' })).rejects.toThrow();
    await expect(seed(patientId, today, { bed: '23:00', wake: '23:00' })).rejects.toThrow();
    await expect(seed(patientId, today, { moodWord: 'x'.repeat(121) })).rejects.toThrow();
  });
});

describe('paciente: autorização (regra 1)', () => {
  it('sem sessão, 401; perfil só de profissional, 403', async () => {
    const anon = request(app);
    const professional = await login('psiquiatra@faisca.test');
    for (const [agent, code] of [[anon, 401], [professional, 403]] as const) {
      expect((await agent.get(`/daily-check-ins?${range()}`)).status).toBe(code);
      expect((await agent.put(`/daily-check-ins/${today}`).send({ mood: 5 })).status).toBe(code);
      expect((await agent.delete(`/daily-check-ins/${today}`)).status).toBe(code);
      expect((await agent.put('/daily-check-ins/settings').send({ tracksMedication: true })).status).toBe(code);
    }
    expect(await prisma.dailyCheckIn.count()).toBe(0);
  });

  it('sem o aceite da 2026-11.7, 403 pedindo o aceite', async () => {
    const agent = await login('sem-aceite@faisca.test');
    for (const result of [
      await agent.get(`/daily-check-ins?${range()}`),
      await agent.put(`/daily-check-ins/${today}`).send({ mood: 5 }),
      await agent.put('/daily-check-ins/settings').send({ tracksMedication: true }),
    ]) {
      expect(result.status).toBe(403);
      expect(result.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
  });

  it('só os próprios dias: o de outra pessoa não aparece nem é apagado', async () => {
    await seed(otherId, today, { mood: 2 });
    const agent = await login();
    expect((await agent.get(`/daily-check-ins?${range()}`)).body.checkIns).toEqual([]);
    expect((await agent.delete(`/daily-check-ins/${today}`)).status).toBe(404);
    expect(await prisma.dailyCheckIn.count({ where: { userId: otherId } })).toBe(1);
  });
});

describe('profissional: só leitura, só as caixas liberadas', () => {
  const base = () => `/therapist/patients/${patientId}/daily-check-ins?${range()}`;

  beforeEach(async () => {
    await seed(patientId, today, { bed: '23:30', wake: '07:00', sleepQuality: 6, mood: 7, moodWord: 'tranquilo', medication: 'TOMOU' });
    await seed(patientId, addDays(today, -1), { medication: 'ESQUECEU_ALGUM' });
  });

  it('com Sono e humor: vê o sono e o humor, sem o remédio', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['SLEEP_MOOD'] });
    const res = await (await login('psiquiatra@faisca.test')).get(base());
    expect(res.status).toBe(200);
    // O dia só com remédio some para ela.
    expect(res.body.checkIns).toEqual([
      expect.objectContaining({ date: today, sleepMinutes: 450, mood: 7, moodWord: 'tranquilo', medication: null, editable: false }),
    ]);
  });

  it('só com Remédio: vê o remédio, sem sono, humor nem a palavra do dia', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATION'] });
    const res = await (await login('psiquiatra@faisca.test')).get(base());
    expect(res.status).toBe(200);
    expect(res.body.checkIns).toEqual([
      expect.objectContaining({ date: addDays(today, -1), medication: 'ESQUECEU_ALGUM', mood: null }),
      expect.objectContaining({ date: today, medication: 'TOMOU', bedTime: null, sleepMinutes: null, mood: null, moodWord: null }),
    ]);
  });

  it('sem nenhuma das duas caixas, 403', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['ACTIVITIES', 'TASKS'] });
    expect((await (await login('psiquiatra@faisca.test')).get(base())).status).toBe(403);
  });

  it('sem vínculo, outro paciente, vínculo desfeito ou sem o aceite dela: 403', async () => {
    const link = await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['SLEEP_MOOD', 'MEDICATION'] });
    expect((await (await login('sem-vinculo@faisca.test')).get(base())).status).toBe(403);
    const agent = await login('psiquiatra@faisca.test');
    expect((await agent.get(`/therapist/patients/${otherId}/daily-check-ins?${range()}`)).status).toBe(403);

    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11.6' } });
    const old = await agent.get(base());
    expect(old.status).toBe(403);
    expect(old.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');

    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: VERSION } });
    await prisma.therapistLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    expect((await agent.get(base())).status).toBe(403);
  });

  it('nunca escreve: PUT, POST e DELETE são 403, e o paciente na rota da profissional também', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['SLEEP_MOOD', 'MEDICATION'] });
    const agent = await login('psiquiatra@faisca.test');
    const path = `/therapist/patients/${patientId}/daily-check-ins`;
    expect((await agent.put(`${path}/${today}`).send({ mood: 1 })).status).toBe(403);
    expect((await agent.post(path).send({ mood: 1 })).status).toBe(403);
    expect((await agent.delete(`${path}/${today}`)).status).toBe(403);
    expect((await agent.put(`/daily-check-ins/${today}`).send({ mood: 1 })).status).toBe(403);
    expect((await (await login()).get(base())).status).toBe(403);
    expect((await prisma.dailyCheckIn.findFirstOrThrow({ where: { userId: patientId, checkInDate: dateOnlyToDate(today) } })).mood).toBe(7);
  });

  it('período de até 92 dias', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['SLEEP_MOOD'] });
    const agent = await login('psiquiatra@faisca.test');
    const path = `/therapist/patients/${patientId}/daily-check-ins`;
    expect((await agent.get(`${path}?from=${addDays(today, -91)}&to=${today}`)).status).toBe(200);
    expect((await agent.get(`${path}?from=${addDays(today, -92)}&to=${today}`)).status).toBe(400);
  });
});

describe('resumo do período', () => {
  beforeEach(async () => {
    await seed(patientId, today, { bed: '23:30', wake: '07:00', sleepQuality: 6, mood: 7, moodWord: 'tranquilo', medication: 'TOMOU' });
    await seed(patientId, addDays(today, -1), { bed: '00:00', wake: '06:00', sleepQuality: 4, mood: 3, medication: 'NAO_TOMOU' });
    // Período anterior (os 7 dias antes): uma noite.
    await seed(patientId, addDays(today, -8), { bed: '22:00', wake: '06:00', mood: 5 });
  });
  const week = () => `from=${addDays(today, -6)}&to=${today}`;

  it('no paciente: sono, humor e remédio comparados, sem a palavra do dia', async () => {
    const res = await (await login()).get(`/period-summary?${week()}`);
    expect(res.status).toBe(200);
    expect(res.body.sleepMood.current).toEqual({
      nights: 2,
      avgSleepMinutes: 405,
      avgSleepQuality: 5,
      moodDays: 2,
      avgMood: 5,
      minMood: 3,
      maxMood: 7,
      series: [
        { date: addDays(today, -1), sleepMinutes: 360, sleepQuality: 4, mood: 3 },
        { date: today, sleepMinutes: 450, sleepQuality: 6, mood: 7 },
      ],
    });
    expect(res.body.sleepMood.previous).toMatchObject({ nights: 1, avgSleepMinutes: 480, avgMood: 5 });
    expect(res.body.medication.current).toEqual({ days: 2, taken: 1, forgotSome: 0, notTaken: 1 });
    expect(res.body.daysWithRecords).toEqual({ current: 2, previous: 1 });
    expect(JSON.stringify(res.body)).not.toContain('tranquilo');
  });

  it('na profissional: caixa fechada vem null e não conta nos dias', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATION'] });
    const res = await (await login('psiquiatra@faisca.test')).get(`/therapist/patients/${patientId}/period-summary?${week()}`);
    expect(res.status).toBe(200);
    expect(res.body.sleepMood).toBeNull();
    expect(res.body.medication.current).toEqual({ days: 2, taken: 1, forgotSome: 0, notTaken: 1 });
    // O dia de 8 dias atrás só tinha sono e humor: fechado, não conta.
    expect(res.body.daysWithRecords).toEqual({ current: 2, previous: 0 });
  });

  it('sem o aceite da 2026-11.7, as duas vêm null', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-11.6' } });
    const res = await (await login()).get(`/period-summary?${week()}`);
    expect(res.body.sleepMood).toBeNull();
    expect(res.body.medication).toBeNull();
  });
});
