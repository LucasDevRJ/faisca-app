import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { ABOUT_TEXT_MAX } from './about-me.schema.js';

// "Sobre mim" do paciente (DEC-081). Dados fictícios (regra 5).
const ABOUT_VERSION = '2026-11';
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';
const OLD_CONSENT = 'aviso-antigo@faisca.test';

const body = {
  aboutMe: 'Gosto de caminhar de manhã e de cozinhar no fim de semana.',
  goals: 'Ansiedade. Socializar.',
  habits: 'Ficar no celular até tarde.',
};

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  // Já com a versão do aviso que cita o "Sobre mim" (a atual ainda é a anterior até as telas).
  const privacyVersion = ABOUT_VERSION;
  patientId = (await createConfirmedUser({ email: PATIENT, privacyVersion })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, privacyVersion })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true, privacyVersion })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true, privacyVersion });
  await createConfirmedUser({ email: OLD_CONSENT, privacyVersion: '2026-10.7' });
  await createTestLink({ patientId, therapistId, method: 'CODE' });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('"Sobre mim" do paciente', () => {
  it('começa vazio, salva os três campos e devolve o que foi salvo', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.get('/about-me')).body.aboutMe).toBeNull();
    const saved = await agent.put('/about-me').send(body);

    expect(saved.status).toBe(200);
    expect(saved.body.aboutMe).toEqual({ id: expect.any(String), ...body, updatedAt: expect.any(String) });
    expect((await agent.get('/about-me')).body.aboutMe).toEqual(saved.body.aboutMe);
  });

  it('campo vazio ou só com espaços vira null; tudo vazio apaga o registro', async () => {
    const agent = await loginAgent(PATIENT);
    await agent.put('/about-me').send(body);

    const partial = await agent.put('/about-me').send({ ...body, habits: '   ' });
    expect(partial.body.aboutMe.habits).toBeNull();

    const empty = await agent.put('/about-me').send({ aboutMe: '', goals: null, habits: ' ' });
    expect(empty.status).toBe(200);
    expect(empty.body.aboutMe).toBeNull();
    expect(await prisma.patientAbout.count()).toBe(0);
  });

  it(`até ${ABOUT_TEXT_MAX} caracteres por campo, no Zod e no CHECK do banco`, async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.put('/about-me').send({ ...body, goals: 'a'.repeat(ABOUT_TEXT_MAX) })).status).toBe(200);
    expect((await agent.put('/about-me').send({ ...body, goals: 'a'.repeat(ABOUT_TEXT_MAX + 1) })).status).toBe(400);
    await expect(
      prisma.patientAbout.update({ where: { userId: patientId }, data: { goals: 'a'.repeat(ABOUT_TEXT_MAX + 1) } }),
    ).rejects.toThrow();
    // Nenhum campo preenchido também é recusado pelo banco.
    await expect(
      prisma.patientAbout.update({ where: { userId: patientId }, data: { aboutMe: null, goals: null, habits: null } }),
    ).rejects.toThrow();
  });

  it('o corpo precisa dos três campos, sem campo a mais (nada de userId ou patientId)', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.put('/about-me').send({ aboutMe: 'x' })).status).toBe(400);
    expect((await agent.put('/about-me').send({ ...body, userId: otherPatientId })).status).toBe(400);
    expect((await agent.put('/about-me').send({ ...body, patientId: otherPatientId })).status).toBe(400);
    expect(await prisma.patientAbout.count({ where: { userId: otherPatientId } })).toBe(0);
  });
});

describe('autorização (regra 1)', () => {
  it('cada paciente só lê e grava o próprio', async () => {
    await (await loginAgent(OTHER_PATIENT)).put('/about-me').send({ ...body, aboutMe: 'Texto da outra paciente.' });
    const agent = await loginAgent(PATIENT);

    expect((await agent.get('/about-me')).body.aboutMe).toBeNull();
    await agent.put('/about-me').send(body);

    const other = await prisma.patientAbout.findUniqueOrThrow({ where: { userId: otherPatientId } });
    expect(other.aboutMe).toBe('Texto da outra paciente.');
  });

  it('sem sessão: 401; conta só de terapeuta: 403', async () => {
    expect((await request(app).get('/about-me')).status).toBe(401);
    expect((await request(app).put('/about-me').send(body)).status).toBe(401);
    const therapist = await loginAgent(THERAPIST);
    expect((await therapist.get('/about-me')).status).toBe(403);
    expect((await therapist.put('/about-me').send(body)).status).toBe(403);
  });

  it('sem o aceite da versão do aviso que cita o "Sobre mim": 403, e o resto do app funciona', async () => {
    const agent = await loginAgent(OLD_CONSENT);

    const res = await agent.get('/about-me');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect((await agent.put('/about-me').send(body)).status).toBe(403);
    expect((await agent.get('/activities').query({ from: '2026-10-01', to: '2026-10-07' })).status).toBe(200);
  });

  it('a terapeuta com vínculo ativo lê; sem vínculo, não; e nunca escreve', async () => {
    await (await loginAgent(PATIENT)).put('/about-me').send(body);
    const path = `/therapist/patients/${patientId}/about-me`;

    const therapist = await loginAgent(THERAPIST);
    const read = await therapist.get(path);
    expect(read.status).toBe(200);
    expect(read.body.aboutMe).toEqual(
      expect.objectContaining({ ...body, readStatus: 'NAO_LIDO', readAt: null }),
    );
    expect((await therapist.put(path).send(body)).status).toBe(403);
    expect((await therapist.delete(path)).status).toBe(403);

    expect((await (await loginAgent(OTHER_THERAPIST)).get(path)).status).toBe(403);
    expect((await therapist.get(`/therapist/patients/${otherPatientId}/about-me`)).status).toBe(403);

    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    expect((await therapist.get(path)).status).toBe(403);
  });

  it('paciente que não contou nada: a terapeuta recebe null', async () => {
    const res = await (await loginAgent(THERAPIST)).get(`/therapist/patients/${patientId}/about-me`);

    expect(res.status).toBe(200);
    expect(res.body.aboutMe).toBeNull();
  });

  it('a terapeuta sem o aceite do "Sobre mim": 403', async () => {
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-10.7' } });
    const res = await (await loginAgent(THERAPIST)).get(`/therapist/patients/${patientId}/about-me`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('"Para ler" da terapeuta (DEC-057, DEC-081)', () => {
  it('entra no "Para ler" e no número de não lidos; marcado, sai; mudou depois, volta como atualizado', async () => {
    const patient = await loginAgent(PATIENT);
    await patient.put('/about-me').send(body);
    const therapist = await loginAgent(THERAPIST);
    const unreadPath = `/therapist/patients/${patientId}/unread`;

    const before = await therapist.get(unreadPath);
    expect(before.body.counts.aboutMe).toBe(1);
    expect(before.body.aboutMe).toHaveLength(1);
    const listed = await therapist.get('/links/patients');
    expect(listed.body.patients[0].unreadCount).toBe(1);

    const id = before.body.aboutMe[0].id;
    const marked = await therapist.put(`/therapist/read-marks/${patientId}`).send({ items: [{ type: 'ABOUT_ME', id }] });
    expect(marked.status).toBe(200);
    expect((await therapist.get(unreadPath)).body.counts.aboutMe).toBe(0);
    expect((await therapist.get(`/therapist/patients/${patientId}/about-me`)).body.aboutMe.readStatus).toBe('LIDO');

    await patient.put('/about-me').send({ ...body, goals: 'Ansiedade. Socializar. Sono.' });
    const after = await therapist.get(`/therapist/patients/${patientId}/about-me`);
    expect(after.body.aboutMe.readStatus).toBe('ATUALIZADO');
    expect((await therapist.get(unreadPath)).body.counts.aboutMe).toBe(1);
  });

  it('marcar o "Sobre mim" de outro paciente: 403, sem gravar', async () => {
    await (await loginAgent(OTHER_PATIENT)).put('/about-me').send(body);
    const other = await prisma.patientAbout.findUniqueOrThrow({ where: { userId: otherPatientId } });
    const therapist = await loginAgent(THERAPIST);

    const res = await therapist
      .put(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'ABOUT_ME', id: other.id }] });

    expect(res.status).toBe(403);
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('o paciente apaga tudo: a marca sai junto e nada fica no "Para ler"', async () => {
    const patient = await loginAgent(PATIENT);
    await patient.put('/about-me').send(body);
    const therapist = await loginAgent(THERAPIST);
    const id = (await prisma.patientAbout.findUniqueOrThrow({ where: { userId: patientId } })).id;
    await therapist.put(`/therapist/read-marks/${patientId}`).send({ items: [{ type: 'ABOUT_ME', id }] });

    await patient.put('/about-me').send({ aboutMe: null, goals: null, habits: null });

    expect(await prisma.readMark.count()).toBe(0);
    expect((await therapist.get(`/therapist/patients/${patientId}/unread`)).body.counts.aboutMe).toBe(0);
  });
});
