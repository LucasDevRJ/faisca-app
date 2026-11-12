import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { ANSWER_MAX, PLANS_MAX, QUESTION_MAX, QUESTIONS_MAX, TITLE_MAX } from './plans.schema.js';

// Meus Planos, 1ª entrega (SPEC, "Meus Planos"; DEC-094). Dados fictícios (regra 5).
const PLANS_VERSION = '2026-11.2';
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';
const OLD_CONSENT = 'aviso-antigo@faisca.test';

const QUESTIONS = [
  'O que aconteceu antes?',
  'O que estava sentindo?',
  'O que estava procurando naquele momento?',
  'O que imaginei que receberia?',
  'O que fiz?',
  'Como me senti depois?',
];
const planBody = { title: 'Quando surgir vontade de checar o celular sem parar', questions: QUESTIONS };
const answers = (first = 'Reunião fictícia que terminou tarde') => [first, 'Cansaço', '', '', 'Fiquei no sofá', 'Melhor'];

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  // Já com a versão do aviso que cita o Meus Planos (a atual ainda é a anterior até as telas).
  const privacyVersion = PLANS_VERSION;
  patientId = (await createConfirmedUser({ email: PATIENT, privacyVersion })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, privacyVersion })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true, privacyVersion })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true, privacyVersion });
  await createConfirmedUser({ email: OLD_CONSENT, privacyVersion: '2026-11' });
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const DAY_MS = 24 * 60 * 60 * 1000;
const entryBody = (overrides: Record<string, unknown> = {}) => ({
  entryDate: addDays(today(), -1),
  entryTime: '21:30',
  answers: answers(),
  ...overrides,
});
const range = () => `from=${addDays(today(), -30)}&to=${today()}`;

// Plano e registro direto no banco. createdAt no passado = já passou do prazo de edição.
function seedPlan(userId: string, overrides: { archivedAt?: Date | null } = {}) {
  return prisma.plan.create({ data: { userId, ...planBody, ...overrides } });
}

function seedEntry(planId: string, userId: string, createdAt = new Date()) {
  return prisma.planEntry.create({
    data: {
      planId,
      userId,
      entryDate: dateOnlyToDate(addDays(today(), -1)),
      questions: QUESTIONS,
      answers: answers(),
      createdAt,
    },
  });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const id = (await seedPlan(patientId)).id;
    const entryId = (await seedEntry(id, patientId)).id;
    const anon = request(app);
    for (const res of [
      await anon.get('/plans'),
      await anon.post('/plans').send(planBody),
      await anon.get(`/plans/${id}`),
      await anon.patch(`/plans/${id}`).send({ title: 'Outro' }),
      await anon.delete(`/plans/${id}`),
      await anon.get(`/plans/${id}/entries?${range()}`),
      await anon.post(`/plans/${id}/entries`).send(entryBody()),
      await anon.get(`/plan-entries/${entryId}`),
      await anon.patch(`/plan-entries/${entryId}`).send({ answers: answers('Outra') }),
      await anon.delete(`/plan-entries/${entryId}`),
    ]) {
      expect(res.status).toBe(401);
    }
  });

  it('conta só de terapeuta: 403 PATIENT_PROFILE_REQUIRED, nada gravado', async () => {
    const therapist = await loginAgent(THERAPIST);
    const created = await therapist.post('/plans').send(planBody);
    expect(created.status).toBe(403);
    expect(created.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect((await therapist.get('/plans')).status).toBe(403);
    expect(await prisma.plan.count()).toBe(0);
  });

  it('a lista traz só os planos da própria pessoa, sem userId', async () => {
    await seedPlan(otherPatientId);
    const patient = await loginAgent(PATIENT);
    await patient.post('/plans').send(planBody);

    const res = await patient.get('/plans');
    expect(res.status).toBe(200);
    expect(res.body.plans).toHaveLength(1);
    expect(res.body.plans[0]).not.toHaveProperty('userId');
  });

  it('plano e registro de outra pessoa: 403 FORBIDDEN, e o banco continua igual', async () => {
    const plan = await seedPlan(otherPatientId);
    const entry = await seedEntry(plan.id, otherPatientId);
    const patient = await loginAgent(PATIENT);

    for (const res of [
      await patient.get(`/plans/${plan.id}`),
      await patient.patch(`/plans/${plan.id}`).send({ title: 'Tomado' }),
      await patient.delete(`/plans/${plan.id}`),
      await patient.get(`/plans/${plan.id}/entries?${range()}`),
      await patient.post(`/plans/${plan.id}/entries`).send(entryBody()),
      await patient.get(`/plan-entries/${entry.id}`),
      await patient.patch(`/plan-entries/${entry.id}`).send({ answers: answers('Tomado') }),
      await patient.delete(`/plan-entries/${entry.id}`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).title).toBe(planBody.title);
    expect(await prisma.planEntry.count()).toBe(1);
    expect((await prisma.planEntry.findUniqueOrThrow({ where: { id: entry.id } })).answers).toEqual(answers());
  });

  it('userId ou patientId no corpo: 400', async () => {
    const patient = await loginAgent(PATIENT);
    expect((await patient.post('/plans').send({ ...planBody, userId: otherPatientId })).status).toBe(400);
    const plan = (await patient.post('/plans').send(planBody)).body.plan;
    expect((await patient.patch(`/plans/${plan.id}`).send({ patientId: otherPatientId })).status).toBe(400);
    expect((await patient.post(`/plans/${plan.id}/entries`).send({ ...entryBody(), userId: otherPatientId })).status).toBe(
      400,
    );
    expect(await prisma.plan.count({ where: { userId: otherPatientId } })).toBe(0);
  });

  it('id que não é UUID: 400; que não existe: 404', async () => {
    const patient = await loginAgent(PATIENT);
    expect((await patient.get('/plans/nao-e-uuid')).status).toBe(400);
    const missing = await patient.get('/plans/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('PLAN_NOT_FOUND');
    expect((await patient.get('/plan-entries/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('aviso de privacidade por área (DEC-042)', () => {
  it('sem o aceite da versão que cita o Meus Planos: 403, e o resto do app funciona', async () => {
    const agent = await loginAgent(OLD_CONSENT);
    const res = await agent.get('/plans');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect((await agent.post('/plans').send(planBody)).status).toBe(403);
    expect((await agent.get('/about-me')).status).toBe(200);
  });
});

describe('planos', () => {
  it('cria, lê, muda o nome e as perguntas, encerra e reabre', async () => {
    const patient = await loginAgent(PATIENT);
    const created = await patient.post('/plans').send({ ...planBody, title: `  ${planBody.title}  ` });
    expect(created.status).toBe(201);
    expect(created.body.plan).toEqual(
      expect.objectContaining({
        title: planBody.title,
        questions: QUESTIONS,
        archived: false,
        hasEntries: false,
        lastEntryDate: null,
      }),
    );
    const id = created.body.plan.id;

    const renamed = await patient.patch(`/plans/${id}`).send({ title: 'Plano fictício', questions: ['O que fiz?'] });
    expect(renamed.status).toBe(200);
    expect(renamed.body.plan).toEqual(expect.objectContaining({ title: 'Plano fictício', questions: ['O que fiz?'] }));

    const archived = await patient.patch(`/plans/${id}`).send({ archived: true });
    expect(archived.body.plan.archived).toBe(true);
    expect(archived.body.plan.archivedAt).not.toBeNull();
    const reopened = await patient.patch(`/plans/${id}`).send({ archived: false });
    expect(reopened.body.plan).toEqual(expect.objectContaining({ archived: false, archivedAt: null }));
  });

  it('a lista traz os ativos antes dos encerrados', async () => {
    const old = await seedPlan(patientId, { archivedAt: new Date() });
    const active = await seedPlan(patientId);
    const res = await (await loginAgent(PATIENT)).get('/plans');
    expect(res.body.plans.map((plan: { id: string }) => plan.id)).toEqual([active.id, old.id]);
  });

  it(`limites: nome até ${TITLE_MAX}, de 1 a ${QUESTIONS_MAX} perguntas de até ${QUESTION_MAX}`, async () => {
    const patient = await loginAgent(PATIENT);
    const longest = { title: 'a'.repeat(TITLE_MAX), questions: Array(QUESTIONS_MAX).fill('q'.repeat(QUESTION_MAX)) };
    expect((await patient.post('/plans').send(longest)).status).toBe(201);
    for (const invalid of [
      { ...planBody, title: '   ' },
      { ...planBody, title: 'a'.repeat(TITLE_MAX + 1) },
      { ...planBody, questions: [] },
      { ...planBody, questions: Array(QUESTIONS_MAX + 1).fill('Pergunta?') },
      { ...planBody, questions: ['Pergunta?', '  '] },
      { ...planBody, questions: ['q'.repeat(QUESTION_MAX + 1)] },
      { title: planBody.title },
    ]) {
      expect((await patient.post('/plans').send(invalid)).status).toBe(400);
    }
    expect(await prisma.plan.count()).toBe(1);
  });

  it('o CHECK do banco barra o que passar do Zod', async () => {
    await expect(
      prisma.plan.create({ data: { userId: patientId, title: planBody.title, questions: [] } }),
    ).rejects.toThrow();
    await expect(
      prisma.plan.create({ data: { userId: patientId, title: planBody.title, questions: ['q'.repeat(QUESTION_MAX + 1)] } }),
    ).rejects.toThrow();
    await expect(prisma.plan.create({ data: { userId: patientId, title: '', questions: QUESTIONS } })).rejects.toThrow();
  });

  it(`até ${PLANS_MAX} planos por conta`, async () => {
    await prisma.plan.createMany({
      data: Array.from({ length: PLANS_MAX }, () => ({ userId: patientId, ...planBody })),
    });
    const res = await (await loginAgent(PATIENT)).post('/plans').send(planBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLANS_LIMIT');
  });

  it(`pedidos ao mesmo tempo não passam do teto de ${PLANS_MAX} planos`, async () => {
    await prisma.plan.createMany({
      data: Array.from({ length: PLANS_MAX - 1 }, () => ({ userId: patientId, ...planBody })),
    });
    const patient = await loginAgent(PATIENT);
    const results = await Promise.all(Array.from({ length: 5 }, () => patient.post('/plans').send(planBody)));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status === 409)).toHaveLength(4);
    expect(await prisma.plan.count({ where: { userId: patientId } })).toBe(PLANS_MAX);
  });

  it('apagar o plano enquanto um registro entra nele: o registro fica e a exclusão dá 409', async () => {
    const plan = await seedPlan(patientId);
    const patient = await loginAgent(PATIENT);
    // Um registro sendo gravado, como no createEntry: segura o plano e demora a confirmar.
    const writing = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${plan.id}::uuid FOR SHARE`;
      await tx.planEntry.create({
        data: { planId: plan.id, userId: patientId, entryDate: dateOnlyToDate(today()), questions: QUESTIONS, answers: answers() },
      });
      await tx.$executeRaw`SELECT pg_sleep(0.5)`;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const [, removed] = await Promise.all([writing, patient.delete(`/plans/${plan.id}`)]);
    expect(removed.status).toBe(409);
    expect(removed.body.error.code).toBe('PLAN_HAS_ENTRIES');
    expect(await prisma.planEntry.count()).toBe(1);
  });

  it('apaga plano sem registros; com registros, 409 e nada sai', async () => {
    const patient = await loginAgent(PATIENT);
    const empty = await seedPlan(patientId);
    expect((await patient.delete(`/plans/${empty.id}`)).status).toBe(204);

    const used = await seedPlan(patientId);
    await seedEntry(used.id, patientId);
    expect((await patient.get(`/plans/${used.id}`)).body.plan).toEqual(
      expect.objectContaining({ hasEntries: true, lastEntryDate: addDays(today(), -1) }),
    );
    const res = await patient.delete(`/plans/${used.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_HAS_ENTRIES');
    expect(await prisma.planEntry.count()).toBe(1);
  });
});

describe('registros', () => {
  it('registra, lista no período e guarda a cópia das perguntas', async () => {
    const patient = await loginAgent(PATIENT);
    const plan = (await patient.post('/plans').send(planBody)).body.plan;

    const created = await patient.post(`/plans/${plan.id}/entries`).send(entryBody());
    expect(created.status).toBe(201);
    expect(created.body.entry).toEqual(
      expect.objectContaining({
        planId: plan.id,
        planTitle: planBody.title,
        entryTime: '21:30',
        questions: QUESTIONS,
        answers: answers(),
        editable: true,
      }),
    );
    expect(created.body.entry).not.toHaveProperty('userId');

    // Mudar as perguntas do plano não mexe no registro antigo.
    await patient.patch(`/plans/${plan.id}`).send({ questions: ['Pergunta nova?'] });
    const listed = await patient.get(`/plans/${plan.id}/entries?${range()}`);
    expect(listed.status).toBe(200);
    expect(listed.body.entries).toHaveLength(1);
    expect(listed.body.entries[0].questions).toEqual(QUESTIONS);
    // Fora do período, não vem.
    const outside = await patient.get(`/plans/${plan.id}/entries?from=${today()}&to=${today()}`);
    expect(outside.body.entries).toHaveLength(0);
  });

  it('respostas: uma por pergunta, pelo menos uma com texto, até o limite', async () => {
    const patient = await loginAgent(PATIENT);
    const plan = await seedPlan(patientId);
    const path = `/plans/${plan.id}/entries`;

    const mismatch = await patient.post(path).send(entryBody({ answers: ['Só uma'] }));
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('ANSWERS_MISMATCH');
    expect((await patient.post(path).send(entryBody({ answers: Array(6).fill('  ') }))).status).toBe(400);
    const tooLong = [...answers()];
    tooLong[0] = 'a'.repeat(ANSWER_MAX + 1);
    expect((await patient.post(path).send(entryBody({ answers: tooLong }))).status).toBe(400);

    const longest = [...answers()];
    longest[0] = 'a'.repeat(ANSWER_MAX);
    expect((await patient.post(path).send(entryBody({ answers: longest }))).status).toBe(201);
  });

  it('dia no futuro, ou hoje com hora que não chegou: 400', async () => {
    const patient = await loginAgent(PATIENT);
    const plan = await seedPlan(patientId);
    const res = await patient.post(`/plans/${plan.id}/entries`).send(entryBody({ entryDate: addDays(today(), 1) }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATE_IN_FUTURE');
    // Sem hora, hoje vale.
    const noTime = await patient.post(`/plans/${plan.id}/entries`).send(entryBody({ entryDate: today(), entryTime: null }));
    expect(noTime.status).toBe(201);
    expect(noTime.body.entry.entryTime).toBeNull();
  });

  it('plano encerrado não recebe registro novo: 409', async () => {
    const plan = await seedPlan(patientId, { archivedAt: new Date() });
    const res = await (await loginAgent(PATIENT)).post(`/plans/${plan.id}/entries`).send(entryBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_ARCHIVED');
  });

  it('edita e exclui no mesmo dia; do dia anterior, 409 e nada muda', async () => {
    const patient = await loginAgent(PATIENT);
    const plan = await seedPlan(patientId);
    const fresh = await seedEntry(plan.id, patientId);

    const edited = await patient.patch(`/plan-entries/${fresh.id}`).send({ answers: answers('Mudou'), entryTime: null });
    expect(edited.status).toBe(200);
    expect(edited.body.entry.answers[0]).toBe('Mudou');
    expect((await patient.patch(`/plan-entries/${fresh.id}`).send({ answers: ['Só uma'] })).status).toBe(400);
    expect((await patient.delete(`/plan-entries/${fresh.id}`)).status).toBe(204);

    const old = await seedEntry(plan.id, patientId, new Date(Date.now() - DAY_MS - 60_000));
    const locked = await patient.patch(`/plan-entries/${old.id}`).send({ answers: answers('Tarde demais') });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('PLAN_ENTRY_LOCKED');
    expect((await patient.delete(`/plan-entries/${old.id}`)).status).toBe(409);
    expect((await prisma.planEntry.findUniqueOrThrow({ where: { id: old.id } })).answers).toEqual(answers());
  });

  it('o CHECK do banco barra respostas fora da regra', async () => {
    const plan = await seedPlan(patientId);
    const data = { planId: plan.id, userId: patientId, entryDate: dateOnlyToDate(today()), questions: QUESTIONS };
    await expect(prisma.planEntry.create({ data: { ...data, answers: ['Só uma'] } })).rejects.toThrow();
    await expect(prisma.planEntry.create({ data: { ...data, answers: Array(6).fill('') } })).rejects.toThrow();
  });
});

describe('visão da terapeuta (só leitura, DEC-094)', () => {
  it('com vínculo ativo, lê os planos e os registros, com o status de leitura', async () => {
    const plan = await seedPlan(patientId);
    await seedEntry(plan.id, patientId);
    const therapist = await loginAgent(THERAPIST);

    const plans = await therapist.get(`/therapist/patients/${patientId}/plans`);
    expect(plans.status).toBe(200);
    expect(plans.body.plans).toHaveLength(1);
    expect(plans.body.plans[0]).not.toHaveProperty('userId');

    const entries = await therapist.get(`/therapist/patients/${patientId}/plans/${plan.id}/entries?${range()}`);
    expect(entries.status).toBe(200);
    expect(entries.body.entries[0]).toEqual(expect.objectContaining({ readStatus: 'NAO_LIDO', readAt: null }));
  });

  it('sem vínculo, com vínculo revogado ou com outro paciente: 403', async () => {
    const plan = await seedPlan(patientId);
    const path = `/therapist/patients/${patientId}/plans`;

    expect((await (await loginAgent(OTHER_THERAPIST)).get(path)).status).toBe(403);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get(`/therapist/patients/${otherPatientId}/plans`)).status).toBe(403);
    // Plano de outro paciente pelo caminho do paciente vinculado: 403, sem os registros.
    const otherPlan = await seedPlan(otherPatientId);
    await seedEntry(otherPlan.id, otherPatientId);
    const crossed = await therapist.get(`/therapist/patients/${patientId}/plans/${otherPlan.id}/entries?${range()}`);
    expect(crossed.status).toBe(403);
    expect(crossed.body).not.toHaveProperty('entries');

    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    expect((await therapist.get(path)).status).toBe(403);
    expect((await therapist.get(`${path}/${plan.id}/entries?${range()}`)).status).toBe(403);
  });

  it('nunca escreve: POST, PATCH e DELETE são 403, mesmo com vínculo ativo', async () => {
    const plan = await seedPlan(patientId);
    const entry = await seedEntry(plan.id, patientId);
    const therapist = await loginAgent(THERAPIST);
    const base = `/therapist/patients/${patientId}/plans`;

    for (const res of [
      await therapist.post(base).send(planBody),
      await therapist.patch(`${base}/${plan.id}`).send({ title: 'Mudado pela terapeuta' }),
      await therapist.delete(`${base}/${plan.id}`),
      await therapist.post(`${base}/${plan.id}/entries`).send(entryBody()),
      // Pelas rotas do paciente, a conta só de terapeuta também não passa.
      await therapist.post(`/plans/${plan.id}/entries`).send(entryBody()),
      await therapist.patch(`/plan-entries/${entry.id}`).send({ answers: answers('Mudado') }),
      await therapist.delete(`/plan-entries/${entry.id}`),
    ]) {
      expect(res.status).toBe(403);
    }
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).title).toBe(planBody.title);
    expect(await prisma.planEntry.count()).toBe(1);
  });

  it('sem sessão: GET 401 e escrita 403; patientId que não é UUID: 403', async () => {
    const anon = request(app);
    expect((await anon.get(`/therapist/patients/${patientId}/plans`)).status).toBe(401);
    expect((await anon.post(`/therapist/patients/${patientId}/plans`).send(planBody)).status).toBe(403);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get('/therapist/patients/nao-e-uuid/plans')).status).toBe(403);
  });

  it('a terapeuta sem o aceite do Meus Planos: 403', async () => {
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11' } });
    const res = await (await loginAgent(THERAPIST)).get(`/therapist/patients/${patientId}/plans`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('"Para ler" da terapeuta (DEC-057, DEC-094)', () => {
  it('os registros entram no "Para ler" e no número de não lidos; o plano, não', async () => {
    const patient = await loginAgent(PATIENT);
    const plan = (await patient.post('/plans').send(planBody)).body.plan;
    const therapist = await loginAgent(THERAPIST);
    const unreadPath = `/therapist/patients/${patientId}/unread`;

    // Só o plano, sem registros: nada para ler.
    expect((await therapist.get(unreadPath)).body.counts.planEntries).toBe(0);

    const entry = (await patient.post(`/plans/${plan.id}/entries`).send(entryBody())).body.entry;
    const before = await therapist.get(unreadPath);
    expect(before.body.counts.planEntries).toBe(1);
    expect(before.body.planEntries[0]).toEqual(expect.objectContaining({ id: entry.id, planTitle: planBody.title }));
    expect((await therapist.get('/links/patients')).body.patients[0].unreadCount).toBe(1);

    const marked = await therapist
      .put(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'PLAN_ENTRY', id: entry.id }] });
    expect(marked.status).toBe(200);
    expect((await therapist.get(unreadPath)).body.counts.planEntries).toBe(0);

    // Mudou depois de lido: volta como atualizado.
    await patient.patch(`/plan-entries/${entry.id}`).send({ answers: answers('Mudou depois') });
    const after = await therapist.get(`/therapist/patients/${patientId}/plans/${plan.id}/entries?${range()}`);
    expect(after.body.entries[0].readStatus).toBe('ATUALIZADO');
    expect((await therapist.get(unreadPath)).body.counts.planEntries).toBe(1);
  });

  it('marcar registro de outro paciente: 403, sem gravar', async () => {
    const otherPlan = await seedPlan(otherPatientId);
    const other = await seedEntry(otherPlan.id, otherPatientId);
    const res = await (await loginAgent(THERAPIST))
      .put(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'PLAN_ENTRY', id: other.id }] });
    expect(res.status).toBe(403);
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('a terapeuta sem o aceite: o Meus Planos vem como null no "Para ler"', async () => {
    const plan = await seedPlan(patientId);
    await seedEntry(plan.id, patientId);
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11' } });
    const res = await (await loginAgent(THERAPIST)).get(`/therapist/patients/${patientId}/unread`);
    expect(res.body.planEntries).toBeNull();
    expect(res.body.counts.planEntries).toBeNull();
  });
});

describe('exclusão da conta', () => {
  it('os planos, os registros e as marcas saem junto', async () => {
    const plan = await seedPlan(patientId);
    const entry = await seedEntry(plan.id, patientId);
    await prisma.readMark.create({ data: { therapistId, patientId, planEntryId: entry.id } });

    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.plan.count()).toBe(0);
    expect(await prisma.planEntry.count()).toBe(0);
    expect(await prisma.readMark.count()).toBe(0);
  });
});
