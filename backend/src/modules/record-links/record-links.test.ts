import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

const PASSWORD = 'senha-ficticia-123';
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;
let records: { id: string }[];

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: 'ligacoes@faisca.test' })).id;
  otherPatientId = (await createConfirmedUser({ email: 'outra-ligacoes@faisca.test' })).id;
  therapistId = (await createConfirmedUser({ email: 'profissional-ligacoes@faisca.test', patient: false, therapist: true })).id;
  records = await Promise.all([patientId, patientId, otherPatientId].map((userId, index) => prisma.activity.create({
    data: {
      userId,
      name: `Atividade fictícia ${index}`,
      activityDate: dateOnlyToDate(todayInAppZone()),
      status: index === 0 ? 'CONCLUIDA' : 'PLANEJADA',
      ...(index === 0 && { wantBefore: 5, pleasure: 6, achievement: 7, observation: 'Anotação opcional fictícia.' }),
    },
    select: { id: true },
  })));
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
  return agent;
}
const query = (id: string) => `/record-links?recordType=ACTIVITY&recordId=${id}`;
const thoughtBody = {
  situationDate: todayInAppZone(), situation: 'Situação fictícia', automaticThought: 'Pensamento fictício',
  beliefLevel: 6, emotions: [{ emotion: 'ANSIEDADE', intensity: 7 }], behavior: 'Ação fictícia', consequence: 'Desfecho fictício',
};
const tensionBody = {
  episodeDate: todayInAppZone(), situation: 'Situação fictícia de tensão', tensionLevel: 8,
  vocalizeUrge: 5, behavior: 'Ação fictícia', consequence: 'Desfecho fictício',
};

describe('ligações entre registros', () => {
  it('o paciente liga e desliga apenas registros próprios', async () => {
    const patient = await login('ligacoes@faisca.test');
    const created = await patient.post('/record-links').send({
      sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'ACTIVITY', targetId: records[1]!.id,
    });
    expect(created.status).toBe(201);
    expect(created.body.link).not.toHaveProperty('userId');
    expect((await patient.get(query(records[0]!.id))).body.links).toHaveLength(1);
    expect((await patient.delete(`/record-links/${created.body.link.id}`)).status).toBe(204);
  });

  it('não expõe ligações de áreas sem aceite de privacidade', async () => {
    // Versão anterior à que cita sono, humor e remédio (2026-11.7, DEC-108): sem esse aceite.
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-11.6' } });
    const patient = await login('ligacoes@faisca.test');
    const checkIn = await prisma.dailyCheckIn.create({ data: {
      userId: patientId, checkInDate: dateOnlyToDate(todayInAppZone()), sleepQuality: 4, mood: 3,
    } });
    const candidates = await patient.get(`/record-links/candidates?recordType=ACTIVITY&recordId=${records[0]!.id}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.candidates).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'SLEEP_MOOD', id: checkIn.id }),
      expect.objectContaining({ type: 'MEDICATION', id: checkIn.id }),
    ]));
    const create = await patient.post('/record-links').send({
      sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'SLEEP_MOOD', targetId: checkIn.id,
    });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });

  it('nega sem sessão, registro de outra pessoa e ligações duplicadas', async () => {
    expect((await request(app).get(query(records[0]!.id))).status).toBe(401);
    const patient = await login('ligacoes@faisca.test');
    expect((await patient.post('/record-links').send({
      sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'ACTIVITY', targetId: records[2]!.id,
    })).status).toBe(404);
    const body = { sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'ACTIVITY', targetId: records[1]!.id };
    expect((await patient.post('/record-links').send(body)).status).toBe(201);
    expect((await patient.post('/record-links').send({ ...body, sourceId: body.targetId, targetId: body.sourceId })).status).toBe(409);
  });

  it('a profissional só lê ligações se as duas áreas estiverem liberadas', async () => {
    const patient = await login('ligacoes@faisca.test');
    const thought = await prisma.thoughtRecord.create({ data: {
      userId: patientId, situationDate: dateOnlyToDate(todayInAppZone()), situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício', beliefLevel: 4, behavior: 'Ação fictícia', consequence: 'Desfecho fictício',
      emotions: { create: [{ emotion: 'ANSIEDADE', intensity: 5 }] },
    } });
    expect((await patient.post('/record-links').send({
      sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'THOUGHT_RECORD', targetId: thought.id,
    })).status).toBe(201);
    await createTestLink({ patientId, therapistId, sharedAreas: ['ACTIVITIES'] });
    const therapist = await login('profissional-ligacoes@faisca.test');
    const response = await therapist.get(`/therapist/patients/${patientId}/record-links?recordType=ACTIVITY&recordId=${records[0]!.id}`);
    expect(response.status).toBe(200);
    expect(response.body.links).toEqual([]);
  });

  it('a profissional lê ligações quando vínculo, áreas e aceites estão liberados', async () => {
    const patient = await login('ligacoes@faisca.test');
    const thought = await prisma.thoughtRecord.create({ data: {
      userId: patientId, situationDate: dateOnlyToDate(todayInAppZone()), situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício', beliefLevel: 4, behavior: 'Ação fictícia', consequence: 'Desfecho fictício',
    } });
    const create = await patient.post('/record-links').send({
      sourceType: 'ACTIVITY', sourceId: records[0]!.id, targetType: 'THOUGHT_RECORD', targetId: thought.id,
    });
    expect(create.status).toBe(201);
    await createTestLink({ patientId, therapistId, sharedAreas: ['ACTIVITIES', 'THOUGHT_RECORDS'] });
    const therapist = await login('profissional-ligacoes@faisca.test');
    const response = await therapist.get(`/therapist/patients/${patientId}/record-links?recordType=ACTIVITY&recordId=${records[0]!.id}`);
    expect(response.status).toBe(200);
    expect(response.body.links).toHaveLength(1);
    expect(response.body.links[0]).not.toHaveProperty('userId');
    expect(response.body.links[0].target).toMatchObject({ type: 'THOUGHT_RECORD', id: thought.id });
    const activitySummary = [response.body.links[0].source, response.body.links[0].target]
      .find((summary: { id: string }) => summary.id === records[0]!.id);
    expect(activitySummary).toMatchObject({ observation: 'Anotação opcional fictícia.' });
  });

  it('cria repetições independentes em RPD e Tensão e mantém a ligação com a raiz', async () => {
    const patient = await login('ligacoes@faisca.test');
    const thought = await patient.post('/thought-records').send(thoughtBody);
    expect(thought.status).toBe(201);
    const repeatedThought = await patient.post('/thought-records').send({ ...thoughtBody, repeatFromId: thought.body.thoughtRecord.id });
    expect(repeatedThought.status).toBe(201);
    const thoughtLink = await prisma.recordLink.findFirst({ where: { kind: 'REPETITION', targetId: repeatedThought.body.thoughtRecord.id } });
    expect(thoughtLink).toMatchObject({ sourceType: 'THOUGHT_RECORD', sourceId: thought.body.thoughtRecord.id });
    const thirdThought = await patient.post('/thought-records').send({ ...thoughtBody, repeatFromId: repeatedThought.body.thoughtRecord.id });
    expect(thirdThought.status).toBe(201);

    const tension = await patient.post('/tension-episodes').send(tensionBody);
    expect(tension.status).toBe(201);
    const repeatedTension = await patient.post('/tension-episodes').send({ ...tensionBody, repeatFromId: tension.body.tensionEpisode.id });
    expect(repeatedTension.status).toBe(201);
    const tensionLink = await prisma.recordLink.findFirst({ where: { kind: 'REPETITION', targetId: repeatedTension.body.tensionEpisode.id } });
    expect(tensionLink).toMatchObject({ sourceType: 'TENSION_EPISODE', sourceId: tension.body.tensionEpisode.id });
    expect((await patient.get(`/record-links?recordType=THOUGHT_RECORD&recordId=${thought.body.thoughtRecord.id}`)).body.links).toHaveLength(2);
    expect((await patient.delete(`/thought-records/${thought.body.thoughtRecord.id}`)).status).toBe(204);
    expect(await prisma.recordLink.findMany({ where: { kind: 'REPETITION', sourceType: 'THOUGHT_RECORD' } })).toMatchObject([
      { sourceId: repeatedThought.body.thoughtRecord.id, targetId: thirdThought.body.thoughtRecord.id },
    ]);
  });

  it('candidatos sem registro de origem (DEC-128): só com o período, e só os próprios', async () => {
    const patient = await login('ligacoes@faisca.test');
    const today = todayInAppZone();
    expect((await patient.get('/record-links/candidates')).status).toBe(400);
    expect((await patient.get(`/record-links/candidates?recordType=ACTIVITY&from=${today}&to=${today}`)).status).toBe(400);
    const res = await patient.get(`/record-links/candidates?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    const ids = res.body.records.map((record: { id: string }) => record.id);
    expect(ids).toEqual(expect.arrayContaining([records[0]!.id, records[1]!.id]));
    expect(ids).not.toContain(records[2]!.id);
  });
});
