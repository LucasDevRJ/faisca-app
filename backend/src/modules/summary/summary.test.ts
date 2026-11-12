import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { previousRange } from './summary.service.js';

// Resumo do período (DEC-100). Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;

const today = () => todayInAppZone();
// Período atual: os últimos 7 dias; o anterior, os 7 antes dele.
const period = () => ({ from: addDays(today(), -6), to: today() });
const inPrevious = () => addDays(today(), -10);

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  await createTestLink({ patientId, therapistId });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

function seedActivity(userId: string, date: string, status: 'CONCLUIDA' | 'NAO_REALIZADA' | 'PLANEJADA', notes = 0) {
  return prisma.activity.create({
    data: {
      userId,
      name: 'Atividade fictícia',
      activityDate: dateOnlyToDate(date),
      status,
      ...(status === 'CONCLUIDA' && { wantBefore: notes, pleasure: notes + 2, achievement: notes + 3 }),
    },
  });
}

function seedThought(
  userId: string,
  date: string,
  emotions: { emotion: 'ANSIEDADE' | 'TRISTEZA' | 'OUTRA'; intensity: number; intensityAfter?: number; otherLabel?: string }[],
  belief = 6,
  withAlternative = false,
) {
  return prisma.thoughtRecord.create({
    data: {
      userId,
      situationDate: dateOnlyToDate(date),
      situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício',
      beliefLevel: belief,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      alternativeExplanation: withAlternative ? 'Alternativa fictícia' : null,
      alternativeAddedAt: withAlternative ? new Date() : null,
      emotions: { create: emotions },
    },
  });
}

function seedTension(userId: string, date: string, tensionLevel: number, vocalizeUrge = 2) {
  return prisma.tensionEpisode.create({
    data: {
      userId,
      episodeDate: dateOnlyToDate(date),
      situation: 'Situação fictícia',
      tensionLevel,
      vocalizeUrge,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
    },
  });
}

function seedAction(userId: string, date: string, category: 'PRAZER' | 'CONEXAO', status: 'AVALIADA' | 'NAO_REALIZADA') {
  return prisma.behavioralAction.create({
    data: {
      userId,
      actionDate: dateOnlyToDate(date),
      name: 'Ação fictícia',
      category,
      status,
      expectation: 3,
      ...(status === 'AVALIADA' && { pleasure: 7, achievement: 6, evaluatedAt: new Date() }),
    },
  });
}

async function seedPlanEntry(userId: string, date: string) {
  const plan = await prisma.plan.create({ data: { userId, title: 'Plano fictício', questions: ['Pergunta fictícia'] } });
  return prisma.planEntry.create({
    data: { planId: plan.id, userId, entryDate: dateOnlyToDate(date), questions: ['Pergunta fictícia'], answers: ['Resposta'] },
  });
}

const professionalPath = (id = patientId) => `/therapist/patients/${id}/period-summary`;

describe('cálculo', () => {
  it('o período anterior tem o mesmo tamanho e termina na véspera', () => {
    expect(previousRange({ from: '2026-11-06', to: '2026-11-12' })).toEqual({ from: '2026-10-30', to: '2026-11-05' });
    expect(previousRange({ from: '2026-08-13', to: '2026-11-12' })).toEqual({ from: '2026-05-13', to: '2026-08-12' });
  });

  it('conta e tira as médias de cada área, com o período anterior ao lado', async () => {
    const { from } = period();
    await seedActivity(patientId, today(), 'CONCLUIDA', 3);
    await seedActivity(patientId, from, 'CONCLUIDA', 5);
    await seedActivity(patientId, today(), 'NAO_REALIZADA');
    await seedActivity(patientId, today(), 'PLANEJADA');
    await seedActivity(patientId, inPrevious(), 'CONCLUIDA', 1);
    await seedThought(patientId, today(), [{ emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 4 }], 7, true);
    await seedThought(patientId, today(), [
      { emotion: 'ANSIEDADE', intensity: 6 },
      { emotion: 'OUTRA', intensity: 5, otherLabel: 'Saudade fictícia' },
    ], 5);
    await seedTension(patientId, today(), 4, 2);
    await seedTension(patientId, from, 9, 5);
    await seedTension(patientId, inPrevious(), 6, 1);
    await seedAction(patientId, today(), 'PRAZER', 'AVALIADA');
    await seedAction(patientId, today(), 'CONEXAO', 'NAO_REALIZADA');
    await seedPlanEntry(patientId, today());
    // Registros de outra pessoa não entram (regra 1).
    await seedActivity(otherPatientId, today(), 'CONCLUIDA', 7);
    const agent = await loginAgent(PATIENT);

    const res = await agent.get('/period-summary').query(period());

    expect(res.status).toBe(200);
    expect(res.body.period).toEqual(period());
    expect(res.body.previousPeriod).toEqual(previousRange(period()));
    expect(res.body.daysWithRecords).toEqual({ current: 2, previous: 1 });
    expect(res.body.activities).toEqual({
      current: { done: 2, notDone: 1, open: 1, avgWantBefore: 4, avgPleasure: 6, avgAchievement: 7 },
      previous: { done: 1, notDone: 0, open: 0, avgWantBefore: 1, avgPleasure: 3, avgAchievement: 4 },
    });
    expect(res.body.thoughtRecords.current).toEqual({
      count: 2,
      // "Outra" entra sem o nome escrito pelo paciente.
      topEmotions: [
        { emotion: 'ANSIEDADE', count: 2, avgIntensity: 7 },
        { emotion: 'OUTRA', count: 1, avgIntensity: 5 },
      ],
      avgBelief: 6,
      withAlternative: 1,
      alternativeEffect: { before: 8, after: 4 },
    });
    expect(JSON.stringify(res.body)).not.toContain('Saudade fictícia');
    expect(res.body.thoughtRecords.previous).toEqual({
      count: 0,
      topEmotions: [],
      avgBelief: null,
      withAlternative: 0,
      alternativeEffect: null,
    });
    expect(res.body.tensionEpisodes).toEqual({
      current: { count: 2, avgTension: 6.5, maxTension: 9, avgVocalize: 3.5 },
      previous: { count: 1, avgTension: 6, maxTension: 6, avgVocalize: 1 },
    });
    expect(res.body.actions.current).toEqual({
      evaluated: 1,
      notDone: 1,
      planned: 0,
      byCategory: { PRAZER: 1, CONEXAO: 0, REALIZACAO: 0 },
      avgExpectation: 3,
      avgPleasure: 7,
      avgAchievement: 6,
    });
    expect(res.body.plans).toEqual({ current: { entries: 1, plans: 1 }, previous: { entries: 0, plans: 0 } });
  });

  it('não devolve texto de registro, só números (regra 7 e privacidade)', async () => {
    await seedActivity(patientId, today(), 'CONCLUIDA', 3);
    await seedThought(patientId, today(), [{ emotion: 'TRISTEZA', intensity: 4 }]);
    const agent = await loginAgent(PATIENT);

    const body = JSON.stringify((await agent.get('/period-summary').query(period())).body);

    expect(body).not.toMatch(/fictíci/);
  });
});

describe('autorização no paciente', () => {
  it('sem sessão: 401', async () => {
    expect((await request(app).get('/period-summary').query(period())).status).toBe(401);
  });

  it('quem só tem o perfil de profissional não tem "Meu resumo": 403', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.get('/period-summary').query(period())).status).toBe(403);
  });

  it('não aceita patientId de outra pessoa na query: usa sempre a sessão', async () => {
    await seedActivity(otherPatientId, today(), 'CONCLUIDA', 7);
    const agent = await loginAgent(PATIENT);

    const res = await agent.get('/period-summary').query({ ...period(), patientId: otherPatientId });

    expect(res.status).toBe(200);
    expect(res.body.activities.current.done).toBe(0);
  });

  it('área sem o aceite do aviso vem como null e não conta nos dias', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-10' } });
    await seedThought(patientId, today(), [{ emotion: 'TRISTEZA', intensity: 4 }]);
    const agent = await loginAgent(PATIENT);

    const res = await agent.get('/period-summary').query(period());

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecords).toBeNull();
    expect(res.body.activities).not.toBeNull();
    expect(res.body.daysWithRecords.current).toBe(0);
  });

  it('período inválido ou maior que 92 dias: 400', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.get('/period-summary').query({ from: today(), to: addDays(today(), -1) })).status).toBe(400);
    expect((await agent.get('/period-summary').query({ from: addDays(today(), -92), to: today() })).status).toBe(400);
    expect((await agent.get('/period-summary').query({ from: addDays(today(), -91), to: today() })).status).toBe(200);
    expect((await agent.get('/period-summary')).status).toBe(400);
  });
});

describe('autorização na profissional (regra 1)', () => {
  it('com vínculo ativo e tudo liberado, vê o resumo do paciente', async () => {
    await seedActivity(patientId, today(), 'CONCLUIDA', 3);
    await seedTension(patientId, today(), 5);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get(professionalPath()).query(period());

    expect(res.status).toBe(200);
    expect(res.body.activities.current.done).toBe(1);
    expect(res.body.tensionEpisodes.current.count).toBe(1);
  });

  it('área não liberada pelo paciente vem como null e não conta nos dias (DEC-097)', async () => {
    await prisma.therapistLink.updateMany({ data: { sharedAreas: ['ACTIVITIES'] } });
    await seedTension(patientId, addDays(today(), -1), 9);
    await seedActivity(patientId, today(), 'CONCLUIDA', 3);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get(professionalPath()).query(period());

    expect(res.status).toBe(200);
    expect(res.body.activities).not.toBeNull();
    expect(res.body.tensionEpisodes).toBeNull();
    expect(res.body.thoughtRecords).toBeNull();
    expect(res.body.actions).toBeNull();
    expect(res.body.plans).toBeNull();
    // Só o dia da atividade: o da tensão fechada não aparece.
    expect(res.body.daysWithRecords.current).toBe(1);
  });

  it('área fechada também não conta nos dias do período anterior', async () => {
    await prisma.therapistLink.updateMany({ data: { sharedAreas: ['ACTIVITIES'] } });
    await seedTension(patientId, inPrevious(), 9);
    await seedThought(patientId, inPrevious(), [{ emotion: 'TRISTEZA', intensity: 4 }]);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get(professionalPath()).query(period());

    expect(res.body.daysWithRecords).toEqual({ current: 0, previous: 0 });
  });

  it('sem o aceite do paciente, Ação e Meus Planos também vêm como null', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-10.4' } });
    await seedAction(patientId, today(), 'PRAZER', 'AVALIADA');
    await seedPlanEntry(patientId, today());
    const agent = await loginAgent(PATIENT);

    const res = await agent.get('/period-summary').query(period());

    expect(res.body.actions).toBeNull();
    expect(res.body.plans).toBeNull();
    expect(res.body.tensionEpisodes).not.toBeNull();
    expect(res.body.daysWithRecords.current).toBe(0);
  });

  it('sem nenhuma área liberada: tudo null, e nenhum dia', async () => {
    await prisma.therapistLink.updateMany({ data: { sharedAreas: [] } });
    await seedActivity(patientId, today(), 'CONCLUIDA', 3);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get(professionalPath()).query(period());

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        daysWithRecords: { current: 0, previous: 0 },
        activities: null,
        thoughtRecords: null,
        tensionEpisodes: null,
        actions: null,
        plans: null,
      }),
    );
  });

  it('área sem o aceite da profissional vem como null', async () => {
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-10' } });
    await seedThought(patientId, today(), [{ emotion: 'TRISTEZA', intensity: 4 }]);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get(professionalPath()).query(period());

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecords).toBeNull();
  });

  it('paciente sem vínculo com ela: 403', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.get(professionalPath(otherPatientId)).query(period())).status).toBe(403);
  });

  it('vínculo desfeito: 403', async () => {
    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    const agent = await loginAgent(THERAPIST);
    expect((await agent.get(professionalPath()).query(period())).status).toBe(403);
  });

  it('o paciente não usa a rota da profissional: 403', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.get(professionalPath()).query(period())).status).toBe(403);
  });

  it('só leitura: outro método é 403', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.post(professionalPath()).send(period())).status).toBe(403);
    expect((await agent.delete(professionalPath())).status).toBe(403);
  });

  it('período maior que 92 dias: 400', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.get(professionalPath()).query({ from: addDays(today(), -92), to: today() })).status).toBe(400);
  });
});
