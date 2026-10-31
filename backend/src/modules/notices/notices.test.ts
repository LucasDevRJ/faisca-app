import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { NOTICE_MAX_LENGTH } from './notices.schema.js';

// Mural de avisos da terapeuta (SPEC, "Mural de avisos"; DEC-079). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const UNLINKED_PATIENT = 'paciente-sem-vinculo@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;
let otherTherapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  await createConfirmedUser({ email: UNLINKED_PATIENT });
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  otherTherapistId = (await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true })).id;
  // As duas pacientes são da mesma terapeuta; a outra terapeuta não tem ninguém.
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
  await prisma.therapistLink.create({ data: { patientId: otherPatientId, therapistId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

function seedNotice(owner = therapistId, body = 'Aviso fictício', createdAt = new Date()) {
  return prisma.therapistNotice.create({ data: { therapistId: owner, body, createdAt } });
}

describe('mural: a terapeuta e os próprios avisos', () => {
  it('publica, lista, edita e apaga; o texto vem sem espaços nas pontas', async () => {
    const agent = await loginAgent(THERAPIST);

    const created = await agent.post('/therapist/notices').send({ body: '  Estarei de férias de 10 a 20.  ' });
    expect(created.status).toBe(201);
    expect(created.body.notice).toEqual({
      id: expect.any(String),
      body: 'Estarei de férias de 10 a 20.',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const id = created.body.notice.id as string;

    expect((await agent.get('/therapist/notices')).body.notices.map((n: { id: string }) => n.id)).toEqual([id]);

    const edited = await agent.patch(`/therapist/notices/${id}`).send({ body: 'Férias de 11 a 20.' });
    expect(edited.status).toBe(200);
    expect(edited.body.notice.body).toBe('Férias de 11 a 20.');

    expect((await agent.delete(`/therapist/notices/${id}`)).status).toBe(204);
    expect(await prisma.therapistNotice.count()).toBe(0);
  });

  it('lista do mais novo para o mais antigo, só os dela', async () => {
    const old = await seedNotice(therapistId, 'Antigo', new Date('2026-10-01T12:00:00Z'));
    const recent = await seedNotice(therapistId, 'Recente', new Date('2026-10-20T12:00:00Z'));
    await seedNotice(otherTherapistId, 'Da outra terapeuta');
    const agent = await loginAgent(THERAPIST);

    const res = await agent.get('/therapist/notices');
    expect(res.body.notices.map((n: { id: string }) => n.id)).toEqual([recent.id, old.id]);
  });

  it('texto vazio, com mais de 2000 caracteres ou com campo a mais: 400 e nada gravado', async () => {
    const agent = await loginAgent(THERAPIST);

    expect((await agent.post('/therapist/notices').send({ body: '   ' })).status).toBe(400);
    expect((await agent.post('/therapist/notices').send({ body: 'a'.repeat(NOTICE_MAX_LENGTH + 1) })).status).toBe(400);
    expect((await agent.post('/therapist/notices').send({ body: 'Oi', patientId })).status).toBe(400);
    expect((await agent.post('/therapist/notices').send({})).status).toBe(400);
    expect(await prisma.therapistNotice.count()).toBe(0);

    // No limite, grava (o CHECK do banco aceita os 2000).
    expect((await agent.post('/therapist/notices').send({ body: 'a'.repeat(NOTICE_MAX_LENGTH) })).status).toBe(201);
  });

  it('aviso que não existe: 404', async () => {
    const agent = await loginAgent(THERAPIST);
    const missing = '00000000-0000-4000-8000-000000000099';

    expect((await agent.patch(`/therapist/notices/${missing}`).send({ body: 'Oi' })).status).toBe(404);
    expect((await agent.delete(`/therapist/notices/${missing}`)).status).toBe(404);
  });

  it('publicar tem limite por hora', async () => {
    const agent = await loginAgent(THERAPIST);
    for (let i = 0; i < 10; i++) {
      expect((await agent.post('/therapist/notices').send({ body: `Aviso ${i}` })).status).toBe(201);
    }
    expect((await agent.post('/therapist/notices').send({ body: 'Mais um' })).status).toBe(429);
  });
});

describe('mural: o paciente', () => {
  it('vê os avisos da terapeuta com vínculo, inclusive os de antes do vínculo, com o "Novo"', async () => {
    const before = await seedNotice(therapistId, 'De antes do vínculo', new Date('2026-01-01T12:00:00Z'));
    const recent = await seedNotice(therapistId, 'Recente');
    await seedNotice(otherTherapistId, 'Da outra terapeuta');
    const agent = await loginAgent(PATIENT);

    const res = await agent.get('/notices');
    expect(res.status).toBe(200);
    expect(res.body.unseenCount).toBe(2);
    expect(res.body.notices).toEqual([
      expect.objectContaining({ id: recent.id, body: 'Recente', seen: false }),
      expect.objectContaining({ id: before.id, body: 'De antes do vínculo', seen: false }),
    ]);
    // Nada que identifique a terapeuta além do que o paciente já vê no vínculo.
    expect(res.body.notices[0]).not.toHaveProperty('therapistId');
  });

  it('marca como visto; o "já vi" é só dele, e editar não volta a ser novo', async () => {
    const notice = await seedNotice();
    const agent = await loginAgent(PATIENT);

    const res = await agent.put('/notices/seen').send({ ids: [notice.id] });
    expect(res.status).toBe(200);
    expect(res.body.unseenCount).toBe(0);
    expect(res.body.notices[0].seen).toBe(true);
    // Marcar de novo não muda nada.
    expect((await agent.put('/notices/seen').send({ ids: [notice.id] })).status).toBe(200);

    // A outra paciente da mesma terapeuta continua com o aviso como novo.
    expect((await (await loginAgent(OTHER_PATIENT)).get('/notices')).body.unseenCount).toBe(1);

    // A terapeuta edita: quem já viu continua com ele visto.
    const therapist = await loginAgent(THERAPIST);
    await therapist.patch(`/therapist/notices/${notice.id}`).send({ body: 'Texto corrigido' });
    const after = await agent.get('/notices');
    expect(after.body.notices[0]).toMatchObject({ body: 'Texto corrigido', seen: true });
  });

  it('sem vínculo: lista vazia', async () => {
    await seedNotice();
    const agent = await loginAgent(UNLINKED_PATIENT);

    expect((await agent.get('/notices')).body).toEqual({ notices: [], unseenCount: 0 });
  });

  it('corpo inválido no "já vi": 400', async () => {
    const agent = await loginAgent(PATIENT);
    const notice = await seedNotice();

    expect((await agent.put('/notices/seen').send({ ids: [] })).status).toBe(400);
    expect((await agent.put('/notices/seen').send({ ids: ['nao-e-uuid'] })).status).toBe(400);
    expect((await agent.put('/notices/seen').send({ ids: [notice.id, notice.id] })).status).toBe(400);
    expect((await agent.put('/notices/seen').send({ ids: [notice.id], patientId })).status).toBe(400);
  });
});

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const id = (await seedNotice()).id;

    expect((await request(app).get('/therapist/notices')).status).toBe(401);
    expect((await request(app).post('/therapist/notices').send({ body: 'Oi' })).status).toBe(401);
    expect((await request(app).patch(`/therapist/notices/${id}`).send({ body: 'Oi' })).status).toBe(401);
    expect((await request(app).delete(`/therapist/notices/${id}`)).status).toBe(401);
    expect((await request(app).get('/notices')).status).toBe(401);
    expect((await request(app).put('/notices/seen').send({ ids: [id] })).status).toBe(401);
  });

  it('a terapeuta não edita nem apaga aviso de outra terapeuta (403) e nada muda', async () => {
    const theirs = await seedNotice(otherTherapistId, 'Da outra terapeuta');
    const agent = await loginAgent(THERAPIST);

    const edit = await agent.patch(`/therapist/notices/${theirs.id}`).send({ body: 'Mudado' });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe('FORBIDDEN');
    expect((await agent.delete(`/therapist/notices/${theirs.id}`)).status).toBe(403);

    const saved = await prisma.therapistNotice.findUniqueOrThrow({ where: { id: theirs.id } });
    expect(saved.body).toBe('Da outra terapeuta');
  });

  it('conta só de paciente não publica nem vê a lista da terapeuta (403)', async () => {
    const agent = await loginAgent(PATIENT);
    const notice = await seedNotice();

    expect((await agent.get('/therapist/notices')).status).toBe(403);
    expect((await agent.post('/therapist/notices').send({ body: 'Oi' })).status).toBe(403);
    expect((await agent.patch(`/therapist/notices/${notice.id}`).send({ body: 'Oi' })).status).toBe(403);
    expect((await agent.delete(`/therapist/notices/${notice.id}`)).status).toBe(403);
    expect(await prisma.therapistNotice.count()).toBe(1);
  });

  it('conta só de terapeuta não usa as rotas do paciente (403)', async () => {
    const agent = await loginAgent(THERAPIST);
    const notice = await seedNotice();

    expect((await agent.get('/notices')).status).toBe(403);
    expect((await agent.put('/notices/seen').send({ ids: [notice.id] })).status).toBe(403);
  });

  it('o paciente não marca aviso de outra terapeuta: 403 e nada gravado', async () => {
    const mine = await seedNotice();
    const theirs = await seedNotice(otherTherapistId, 'Da outra terapeuta');
    const agent = await loginAgent(PATIENT);

    const res = await agent.put('/notices/seen').send({ ids: [mine.id, theirs.id] });
    expect(res.status).toBe(403);
    expect(await prisma.noticeSeen.count()).toBe(0);
  });

  it('ao revogar o vínculo, o paciente deixa de ver e de marcar na hora', async () => {
    const notice = await seedNotice();
    const agent = await loginAgent(PATIENT);
    expect((await agent.get('/notices')).body.notices).toHaveLength(1);

    await prisma.therapistLink.updateMany({ where: { patientId }, data: { revokedAt: new Date() } });

    expect((await agent.get('/notices')).body).toEqual({ notices: [], unseenCount: 0 });
    expect((await agent.put('/notices/seen').send({ ids: [notice.id] })).status).toBe(403);
  });

  it('as rotas do mural não abrem escrita em /therapist/patients (onlyReads continua)', async () => {
    const agent = await loginAgent(THERAPIST);

    expect((await agent.post(`/therapist/patients/${patientId}/notices`).send({ body: 'Oi' })).status).toBe(403);
  });

  it('o aviso some com a conta da terapeuta, e o "já vi" com a do paciente', async () => {
    const notice = await seedNotice();
    await prisma.noticeSeen.create({ data: { noticeId: notice.id, patientId } });

    await prisma.user.delete({ where: { id: patientId } });
    expect(await prisma.noticeSeen.count()).toBe(0);

    await prisma.user.delete({ where: { id: therapistId } });
    expect(await prisma.therapistNotice.count()).toBe(0);
  });
});
