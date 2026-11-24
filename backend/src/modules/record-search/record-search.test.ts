import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

const PASSWORD = 'senha-ficticia-123';
const term = 'ansiosa';
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherId: string;
let therapistId: string;
let linkId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: 'busca@faisca.test' })).id;
  otherId = (await createConfirmedUser({ email: 'outra-busca@faisca.test' })).id;
  therapistId = (await createConfirmedUser({ email: 'terapeuta-busca@faisca.test', patient: false, therapist: true })).id;
  await createConfirmedUser({ email: 'sem-vinculo-busca@faisca.test', patient: false, therapist: true });
  linkId = (await createTestLink({ patientId, therapistId })).id;
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
  return agent;
}

async function seedThought(userId = patientId, situation = 'Fiquei ansioso antes da conversa.', emotion: 'ANSIEDADE' | 'TRISTEZA' = 'ANSIEDADE') {
  return prisma.thoughtRecord.create({ data: {
    userId, situationDate: dateOnlyToDate(todayInAppZone()), situation,
    automaticThought: 'Não vou conseguir conversar.', beliefLevel: 7,
    behavior: 'Fiquei em silêncio.', consequence: 'A conversa foi adiada.',
    emotions: { create: [{ emotion, intensity: 8 }] },
  } });
}

describe('busca de registros', () => {
  it('exige sessão e perfil de paciente, e a profissional precisa de vínculo ativo', async () => {
    expect((await request(app).post('/records/search').send({ term })).status).toBe(401);
    const patient = await login('busca@faisca.test');
    const professional = await login('terapeuta-busca@faisca.test');
    const noLink = await login('sem-vinculo-busca@faisca.test');
    expect((await professional.post(`/therapist/patients/${patientId}/records/search`).send({ term })).status).toBe(200);
    expect((await noLink.post(`/therapist/patients/${patientId}/records/search`).send({ term })).status).toBe(403);
    expect((await patient.post(`/therapist/patients/${patientId}/records/search`).send({ term })).status).toBe(403);
    expect((await professional.post(`/therapist/patients/${otherId}/records/search`).send({ term })).status).toBe(403);
    expect((await professional.post(`/therapist/patients/${patientId}/records/search`).send({ term, userId: otherId })).status).toBe(400);
    expect((await professional.patch(`/therapist/patients/${patientId}/records/search`).send({ term })).status).toBe(403);
    expect((await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } })).revokedAt).not.toBeNull();
    expect((await professional.post(`/therapist/patients/${patientId}/records/search`).send({ term })).status).toBe(403);
  });

  it('busca com acentos e flexão de gênero, traz detalhe e limita aos registros da paciente', async () => {
    const own = await seedThought(patientId, 'Fiquei ansioso antes da conversa.');
    await seedThought(otherId, 'A paciente ficou ansiosa na escola.');
    const patient = await login('busca@faisca.test');
    const result = await patient.post('/records/search').send({ term: 'ANSÍOSA' });
    expect(result.status).toBe(200);
    expect(result.body.results).toHaveLength(1);
    // O título do Pensamento é o pensamento automático, como no "Sobre um registro" (DEC-128).
    expect(result.body.results[0]).toMatchObject({ id: own.id, type: 'THOUGHT_RECORD', title: 'Não vou conseguir conversar.', titleMatch: null });
    expect(result.body.results[0].content).toMatchObject({ automaticThought: 'Não vou conseguir conversar.', beliefLevel: 7 });
    expect(result.body.results[0]).not.toHaveProperty('userId');
    expect(result.body.results[0]).toMatchObject({ excerptField: 'situation', excerpt: 'Fiquei ansioso antes da conversa.' });
  });

  it('o trecho vem de um campo só, com a palavra inteira realçada e sem código interno (#305)', async () => {
    await prisma.homeworkTask.create({ data: {
      userId: patientId, title: 'Tarefa fictícia', description: 'Anotar uma observação fictícia.',
      responseText: 'Primeira linha.\nAinda estou pensando sobre o assunto fictício.', responseStatus: 'NAO_CONSEGUI', respondedAt: new Date(),
    } });
    const patient = await login('busca@faisca.test');
    const highlighted = (body: { excerpt: string; matchStart: number; matchLength: number }) =>
      body.excerpt.slice(body.matchStart, body.matchStart + body.matchLength);

    const byAnswer = (await patient.post('/records/search').send({ term: 'pensando' })).body.results[0];
    expect(byAnswer).toMatchObject({ type: 'TASK', title: 'Tarefa fictícia', titleMatch: null, excerptField: 'responseText' });
    expect(byAnswer.excerpt).toBe('Primeira linha. Ainda estou pensando sobre o assunto fictício.');
    expect(highlighted(byAnswer)).toBe('pensando');

    // A aproximação de gênero acha "fictícia" no título e "fictício" no campo; os dois realces cobrem a palavra inteira.
    const byGender = (await patient.post('/records/search').send({ term: 'fictício' })).body.results[0];
    expect(byGender.titleMatch).toEqual({ start: 7, length: 8 });
    expect(byGender.excerptField).toBe('description');
    expect(highlighted(byGender)).toBe('fictícia');

    const byStatus = (await patient.post('/records/search').send({ term: 'consegui' })).body.results[0];
    expect(byStatus).toMatchObject({ excerptField: 'responseStatus', excerpt: 'Não consegui fazer' });
    expect(JSON.stringify((await patient.post('/records/search').send({ term: 'fictício' })).body.results.map((r: { excerpt: string }) => r.excerpt))).not.toContain('NAO_CONSEGUI');
  });

  it('palavra só no título não repete o título no trecho; trecho longo não corta palavras', async () => {
    await prisma.activity.create({ data: { userId: patientId, name: 'Ligar para uma amiga', activityDate: dateOnlyToDate(todayInAppZone()), status: 'PLANEJADA' } });
    const long = `${'palavra '.repeat(30)}encontrada ${'depois '.repeat(40)}`.trim();
    await prisma.activity.create({ data: { userId: patientId, name: 'Atividade fictícia', activityDate: dateOnlyToDate(todayInAppZone()), status: 'NAO_REALIZADA', observation: long } });
    const patient = await login('busca@faisca.test');
    const onlyTitle = (await patient.post('/records/search').send({ term: 'amigo' })).body.results[0];
    expect(onlyTitle).toMatchObject({ title: 'Ligar para uma amiga', titleMatch: { start: 15, length: 5 }, excerpt: '', excerptField: null });

    const inLong = (await patient.post('/records/search').send({ term: 'encontrada' })).body.results[0];
    expect(inLong.excerptField).toBe('observation');
    expect(inLong.excerpt.startsWith('…palavra ')).toBe(true);
    expect(inLong.excerpt.endsWith(' depois…')).toBe(true);
    expect(inLong.excerpt.slice(inLong.matchStart, inLong.matchStart + inLong.matchLength)).toBe('encontrada');

    // Campo que começa com quebra de linha: o realce continua na palavra certa.
    await prisma.activity.create({ data: { userId: patientId, name: 'Outra atividade', activityDate: dateOnlyToDate(todayInAppZone()), status: 'NAO_REALIZADA', observation: '\n  procurada no começo' } });
    const leading = (await patient.post('/records/search').send({ term: 'procurada' })).body.results[0];
    expect(leading.excerpt).toBe('procurada no começo');
    expect(leading.excerpt.slice(leading.matchStart, leading.matchStart + leading.matchLength)).toBe('procurada');
  });

  it('aplica filtros de emoção, intensidade, tipo, período e paginação', async () => {
    const older = await seedThought(patientId, 'Uma situação fictícia de tristeza.', 'TRISTEZA');
    await prisma.thoughtRecord.update({ where: { id: older.id }, data: { situationDate: dateOnlyToDate('2026-01-01') } });
    await seedThought(patientId, 'Uma situação fictícia de ansiedade.');
    const patient = await login('busca@faisca.test');
    const base = { term: 'situação fictícia', types: ['THOUGHT_RECORD'], from: '2026-01-01', to: todayInAppZone(), pageSize: 1 };
    const page1 = await patient.post('/records/search').send({ ...base, emotion: 'tristeza', minIntensity: 8, page: 1 });
    expect(page1.status).toBe(200);
    expect(page1.body).toMatchObject({ total: 1, hasMore: false, page: 1, pageSize: 1 });
    expect(page1.body.results[0].type).toBe('THOUGHT_RECORD');
    expect((await patient.post('/records/search').send({ term: 'situação fictícia', from: '2026-01-01' })).status).toBe(400);
    expect((await patient.post('/records/search').send({ term: 'x', onlyUnread: true })).status).toBe(400);
  });

  it('a profissional respeita áreas e aceites de ambas as contas; só não lidos filtra e não marca leitura', async () => {
    const thought = await seedThought();
    const professional = await login('terapeuta-busca@faisca.test');
    const path = `/therapist/patients/${patientId}/records/search`;
    const search = () => professional.post(path).send({ term: 'ansioso', types: ['THOUGHT_RECORD'] });
    expect((await search()).body.results).toHaveLength(1);
    expect((await professional.post(path).send({ term: 'ansioso', types: ['THOUGHT_RECORD'], onlyUnread: true })).body.results).toHaveLength(1);
    await prisma.readMark.create({ data: { therapistId, patientId, thoughtRecordId: thought.id } });
    expect((await professional.post(path).send({ term: 'ansioso', types: ['THOUGHT_RECORD'], onlyUnread: true })).body.results).toHaveLength(0);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['ACTIVITIES'] } });
    expect((await search()).body.results).toHaveLength(0);
    const hiddenAreaSearch = await professional.post(path).send({ term: 'ansioso', types: ['THOUGHT_RECORD'] });
    expect(hiddenAreaSearch.status).toBe(200);
    expect(hiddenAreaSearch.body.results).toHaveLength(0);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['THOUGHT_RECORDS'] } });
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-10' } });
    expect((await search()).body.results).toHaveLength(0);
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-11.7' } });
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-10' } });
    expect((await search()).body.results).toHaveLength(0);
  });

  it('valida o corpo e o limite do intervalo sem registrar o termo na URL', async () => {
    const patient = await login('busca@faisca.test');
    expect((await patient.post('/records/search').send({ term: '   ' })).status).toBe(400);
    expect((await patient.post('/records/search').send({ term: 'ansiosa', from: '2025-01-01', to: '2026-11-19' })).status).toBe(400);
    expect((await patient.post('/records/search').send({ term: 'ansiosa', unexpected: true })).status).toBe(400);
  });
});
