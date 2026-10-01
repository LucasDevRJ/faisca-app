import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { isEditable } from './thought-records.service.js';

// Registro de Pensamentos (SPEC, "Registro de Pensamentos"; DEC-039).
// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OLD_PRIVACY = 'antiga@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true });
  // Aceitou só a versão do aviso de antes do RPD.
  await createConfirmedUser({ email: OLD_PRIVACY, privacyVersion: '2026-10' });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const DAY_MS = 24 * 60 * 60 * 1000;

function body(overrides: Record<string, unknown> = {}) {
  return {
    situationDate: today(),
    situation: 'Situação fictícia no trabalho',
    automaticThought: 'Pensamento fictício',
    beliefLevel: 7,
    emotions: [
      { emotion: 'ANSIEDADE', intensity: 8 },
      { emotion: 'OUTRA', intensity: 4, otherLabel: 'Inquietação' },
    ],
    behavior: 'Comportamento fictício',
    consequence: 'Consequência fictícia',
    ...overrides,
  };
}

// Registro direto no banco. createdAt no passado = já passou do prazo de edição.
function seedRecord(userId: string, { situationDate = today(), createdAt = new Date(), situation = 'Situação fictícia' } = {}) {
  return prisma.thoughtRecord.create({
    data: {
      userId,
      situationDate: dateOnlyToDate(situationDate),
      situation,
      automaticThought: 'Pensamento fictício',
      beliefLevel: 5,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      createdAt,
      emotions: { create: [{ emotion: 'TRISTEZA', intensity: 6 }] },
    },
  });
}

const yesterday = () => new Date(Date.now() - DAY_MS - 60_000);

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const { id } = await seedRecord(patientId);
    const calls = [
      request(app).get('/thought-records').query({ from: today(), to: today() }),
      request(app).get(`/thought-records/${id}`),
      request(app).post('/thought-records').send(body()),
      request(app).patch(`/thought-records/${id}`).send({ beliefLevel: 1 }),
      request(app).delete(`/thought-records/${id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente, nada gravado', async () => {
    const { id } = await seedRecord(patientId);
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get('/thought-records').query({ from: today(), to: today() });
    const one = await agent.get(`/thought-records/${id}`);
    const create = await agent.post('/thought-records').send(body());

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(one.status).toBe(403);
    expect(create.status).toBe(403);
    expect(await prisma.thoughtRecord.count()).toBe(1);
  });

  it('a lista traz só os registros da própria paciente, sem userId', async () => {
    await seedRecord(patientId, { situation: 'Minha situação' });
    await seedRecord(otherPatientId, { situation: 'Situação da outra' });

    const res = await (await loginAgent()).get('/thought-records').query({ from: today(), to: today() });

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecords.map((r: { situation: string }) => r.situation)).toEqual(['Minha situação']);
    expect(res.body.thoughtRecords[0]).not.toHaveProperty('userId');
  });

  it('registro de outra paciente: 403 em ler, editar e excluir, sem alterar nada', async () => {
    const theirs = await seedRecord(otherPatientId, { situation: 'Situação da outra' });
    const agent = await loginAgent();

    const read = await agent.get(`/thought-records/${theirs.id}`);
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(read.body)).not.toContain('Situação da outra');

    const edit = await agent.patch(`/thought-records/${theirs.id}`).send({ beliefLevel: 1 });
    const remove = await agent.delete(`/thought-records/${theirs.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.thoughtRecord.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('o userId vem da sessão: userId ou patientId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const withUser = await agent.post('/thought-records').send(body({ userId: otherPatientId }));
    const withPatient = await agent.post('/thought-records').send(body({ patientId: otherPatientId }));

    expect(withUser.status).toBe(400);
    expect(withPatient.status).toBe(400);
    expect(await prisma.thoughtRecord.count()).toBe(0);
  });
});

describe('aviso de privacidade (DEC-039)', () => {
  it('sem o aceite da versão atual: 403 em todas as rotas e nada gravado', async () => {
    const agent = await loginAgent(OLD_PRIVACY);

    const list = await agent.get('/thought-records').query({ from: today(), to: today() });
    const create = await agent.post('/thought-records').send(body());

    for (const res of [list, create]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
    expect(await prisma.thoughtRecord.count()).toBe(0);
  });

  it('o resto do app continua funcionando sem o novo aceite', async () => {
    const agent = await loginAgent(OLD_PRIVACY);

    expect((await agent.get('/appointments')).status).toBe(200);
    expect((await agent.get('/activities').query({ from: today(), to: today() })).status).toBe(200);
  });

  it('depois de aceitar, a área libera', async () => {
    const agent = await loginAgent(OLD_PRIVACY);
    await agent.post('/auth/accept-privacy').send({ acceptPrivacy: true });

    expect((await agent.post('/thought-records').send(body())).status).toBe(201);
  });
});

describe('POST /thought-records', () => {
  it('cria com todos os campos e devolve as emoções na ordem da lista', async () => {
    const res = await (await loginAgent())
      .post('/thought-records')
      .send(body({ emotions: [{ emotion: 'ALIVIO', intensity: 2 }, { emotion: 'TRISTEZA', intensity: 9 }] }));

    expect(res.status).toBe(201);
    expect(res.body.thoughtRecord).toEqual({
      id: expect.any(String),
      situationDate: today(),
      situation: 'Situação fictícia no trabalho',
      automaticThought: 'Pensamento fictício',
      beliefLevel: 7,
      emotions: [
        { emotion: 'TRISTEZA', intensity: 9, otherLabel: null },
        { emotion: 'ALIVIO', intensity: 2, otherLabel: null },
      ],
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      editable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('todos os campos são obrigatórios', async () => {
    const agent = await loginAgent();
    const fields = ['situationDate', 'situation', 'automaticThought', 'beliefLevel', 'emotions', 'behavior', 'consequence'];

    for (const field of fields) {
      const incomplete: Record<string, unknown> = body();
      delete incomplete[field];
      const res = await agent.post('/thought-records').send(incomplete);
      expect(res.status, field).toBe(400);
    }
    // Texto só com espaços também conta como vazio.
    expect((await agent.post('/thought-records').send(body({ situation: '   ' }))).status).toBe(400);
    expect(await prisma.thoughtRecord.count()).toBe(0);
  });

  it('valida as faixas, os tamanhos e as emoções', async () => {
    const agent = await loginAgent();
    const invalid = [
      { beliefLevel: 11 },
      { beliefLevel: -1 },
      { beliefLevel: 5.5 },
      { situation: 'x'.repeat(1001) },
      { emotions: [] },
      { emotions: [{ emotion: 'TEDIO', intensity: 3 }] },
      { emotions: [{ emotion: 'MEDO', intensity: 11 }] },
      // A mesma emoção duas vezes.
      { emotions: [{ emotion: 'MEDO', intensity: 3 }, { emotion: 'MEDO', intensity: 5 }] },
      // "Outra" sem nome; nome em emoção que não é "outra"; nome longo demais.
      { emotions: [{ emotion: 'OUTRA', intensity: 3 }] },
      { emotions: [{ emotion: 'MEDO', intensity: 3, otherLabel: 'Pânico' }] },
      { emotions: [{ emotion: 'OUTRA', intensity: 3, otherLabel: 'x'.repeat(51) }] },
    ];

    for (const overrides of invalid) {
      const res = await agent.post('/thought-records').send(body(overrides));
      expect(res.status, JSON.stringify(overrides).slice(0, 80)).toBe(400);
    }
    expect((await agent.post('/thought-records').send(body({ situation: 'x'.repeat(1000) }))).status).toBe(201);
  });

  it('a situação é de hoje ou de antes: amanhã é 400', async () => {
    const agent = await loginAgent();

    const future = await agent.post('/thought-records').send(body({ situationDate: addDays(today(), 1) }));
    const past = await agent.post('/thought-records').send(body({ situationDate: addDays(today(), -30) }));

    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('DATE_IN_FUTURE');
    expect(past.status).toBe(201);
  });

  it('a mensagem de erro não repete o texto enviado', async () => {
    const res = await (await loginAgent()).post('/thought-records').send(body({ beliefLevel: 'segredo-ficticio' }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('segredo-ficticio');
  });
});

describe('GET /thought-records/:id', () => {
  it('devolve o próprio registro, sem userId; inexistente é 404', async () => {
    const record = await seedRecord(patientId, { situation: 'Minha situação' });
    const agent = await loginAgent();

    const res = await agent.get(`/thought-records/${record.id}`);
    const unknown = await agent.get('/thought-records/00000000-0000-4000-8000-000000000999');

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecord).toMatchObject({ id: record.id, situation: 'Minha situação', editable: true });
    expect(res.body.thoughtRecord).not.toHaveProperty('userId');
    expect(unknown.status).toBe(404);
  });

  it('sem o aceite da versão atual do aviso: 403', async () => {
    const record = await seedRecord(patientId);

    const res = await (await loginAgent(OLD_PRIVACY)).get(`/thought-records/${record.id}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('GET /thought-records', () => {
  it('filtra pelo dia da situação e ordena por dia e depois por registro', async () => {
    const twoDaysAgo = addDays(today(), -2);
    await seedRecord(patientId, { situationDate: today(), situation: 'Hoje' });
    await seedRecord(patientId, { situationDate: twoDaysAgo, situation: 'Antes, primeiro' });
    await seedRecord(patientId, { situationDate: twoDaysAgo, situation: 'Antes, segundo' });
    await seedRecord(patientId, { situationDate: addDays(today(), -10), situation: 'Fora do período' });

    const res = await (await loginAgent()).get('/thought-records').query({ from: addDays(today(), -6), to: today() });

    expect(res.body.thoughtRecords.map((r: { situation: string }) => r.situation)).toEqual([
      'Antes, primeiro',
      'Antes, segundo',
      'Hoje',
    ]);
  });

  it('aceita até 42 dias', async () => {
    const agent = await loginAgent();

    expect((await agent.get('/thought-records').query({ from: addDays(today(), -41), to: today() })).status).toBe(200);
    expect((await agent.get('/thought-records').query({ from: addDays(today(), -42), to: today() })).status).toBe(400);
  });

  it('marca como não editável o que foi registrado em outro dia', async () => {
    await seedRecord(patientId, { situation: 'Antigo', createdAt: yesterday() });

    const res = await (await loginAgent()).get('/thought-records').query({ from: today(), to: today() });

    expect(res.body.thoughtRecords[0].editable).toBe(false);
  });
});

describe('PATCH e DELETE: só no dia do registro', () => {
  it('no mesmo dia: edita os campos e troca a lista de emoções inteira', async () => {
    const record = await seedRecord(patientId);
    const agent = await loginAgent();

    const res = await agent
      .patch(`/thought-records/${record.id}`)
      .send({ beliefLevel: 2, emotions: [{ emotion: 'RAIVA', intensity: 5 }] });

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecord).toMatchObject({
      beliefLevel: 2,
      situation: 'Situação fictícia',
      emotions: [{ emotion: 'RAIVA', intensity: 5, otherLabel: null }],
    });
    expect(await prisma.thoughtRecordEmotion.count({ where: { recordId: record.id } })).toBe(1);
  });

  it('no mesmo dia: exclui o registro e as emoções', async () => {
    const record = await seedRecord(patientId);

    const res = await (await loginAgent()).delete(`/thought-records/${record.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.thoughtRecord.count()).toBe(0);
    expect(await prisma.thoughtRecordEmotion.count()).toBe(0);
  });

  it('registrado em outro dia: 409 em editar e excluir, sem alterar nada', async () => {
    const record = await seedRecord(patientId, { createdAt: yesterday() });
    const agent = await loginAgent();

    const edit = await agent.patch(`/thought-records/${record.id}`).send({ beliefLevel: 1 });
    const remove = await agent.delete(`/thought-records/${record.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('THOUGHT_RECORD_LOCKED');
    }
    expect(await prisma.thoughtRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record);
  });

  it('valida a edição: corpo vazio, campo a mais, data no futuro e emoções inválidas', async () => {
    const record = await seedRecord(patientId);
    const agent = await loginAgent();

    for (const payload of [
      {},
      { userId: otherPatientId },
      { situationDate: addDays(today(), 1) },
      { emotions: [] },
      { situation: '' },
    ]) {
      expect((await agent.patch(`/thought-records/${record.id}`).send(payload)).status).toBe(400);
    }
  });

  it('id inexistente: 404; id inválido: 400', async () => {
    const agent = await loginAgent();

    const unknown = await agent.patch('/thought-records/00000000-0000-4000-8000-000000000999').send({ beliefLevel: 1 });
    const invalid = await agent.delete('/thought-records/nao-e-uuid');

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(400);
  });
});

describe('isEditable', () => {
  it('compara os dias em São Paulo, não em UTC', () => {
    // 02:00 UTC do dia 2 ainda é 23:00 do dia 1 em São Paulo.
    const createdAt = new Date('2026-10-02T02:00:00Z');
    expect(isEditable(createdAt, new Date('2026-10-02T02:59:00Z'))).toBe(true);
    expect(isEditable(createdAt, new Date('2026-10-02T03:00:00Z'))).toBe(false);
  });
});
