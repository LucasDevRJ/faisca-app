import { createECDH } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { runInline } from '../../lib/background.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePushSender } from '../../test/fake-push-sender.js';
import { MESSAGES_PRIVACY_VERSION } from '../auth/privacy.js';

const patientEmail = 'mensagens-paciente@faisca.test';
const professionalEmail = 'mensagens-profissional@faisca.test';
const strangerEmail = 'mensagens-outra@faisca.test';
const password = 'senha-ficticia-123';
const text = 'Posso confirmar o horário da consulta fictícia?';
const input = { topic: 'LOGISTICA', body: text };
let mailer: FakeMailer;
let pushSender: FakePushSender;
let app: ReturnType<typeof createApp>;
let linkId: string;
let professionalId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  pushSender = new FakePushSender();
  app = createApp({ mailer, pushSender, runAfterResponse: runInline });
  const patient = await createConfirmedUser({ email: patientEmail, privacyVersion: MESSAGES_PRIVACY_VERSION });
  const professional = await createConfirmedUser({
    email: professionalEmail, patient: false, therapist: true, professionalKind: 'PSIQUIATRIA',
    privacyVersion: MESSAGES_PRIVACY_VERSION,
  });
  professionalId = professional.id;
  await createConfirmedUser({ email: strangerEmail, patient: false, therapist: true, privacyVersion: MESSAGES_PRIVACY_VERSION });
  const link = await createTestLink({
    patientId: patient.id, therapistId: professional.id, kind: 'PSIQUIATRIA', sharedAreas: [],
  });
  linkId = link.id;
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password })).status).toBe(200);
  return agent;
}

describe('autorização (regra 1)', () => {
  it('paciente e psiquiatra enviam e leem apenas a conversa em comum', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const url = `/messages/${linkId}`;
    expect((await patient.get('/messages')).body).toEqual([
      expect.objectContaining({ id: linkId, counterpart: 'PSIQUIATRIA', available: true }),
    ]);
    const sent = await patient.post(url).send(input);
    expect(sent.status).toBe(201);
    expect(sent.headers['cache-control']).toBe('no-store');
    expect(sent.body).toEqual({ id: expect.any(String), topic: 'LOGISTICA', body: text, mine: true, createdAt: expect.any(String), record: null });
    expect((await professional.get(url)).body.messages[0]).toMatchObject({ body: text, mine: false });
    expect((await professional.post(url).send({ topic: 'DUVIDA', body: 'Sim, podemos confirmar.' })).status).toBe(201);
    expect((await patient.get(url)).body.messages).toHaveLength(2);
  });

  it('barra visitante, outra profissional, campo forjado e as duas partes após revogação', async () => {
    const url = `/messages/${linkId}`;
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const stranger = await login(strangerEmail);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await request(app).post(url).send(input)).status).toBe(401);
    expect((await stranger.get('/messages')).body).toEqual([]);
    expect((await stranger.get(url)).status).toBe(403);
    expect((await stranger.post(url).send(input)).status).toBe(403);
    expect((await patient.post(url).send({ ...input, patientId: professionalId })).status).toBe(400);
    expect((await patient.post(url).send(input)).status).toBe(201);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    for (const participant of [patient, professional]) {
      expect((await participant.get('/messages')).body).toEqual([]);
      expect((await participant.get(url)).status).toBe(403);
      expect((await participant.post(url).send(input)).status).toBe(403);
    }
    expect(await prisma.privateMessage.count()).toBe(1);
    expect((await professional.post('/auth/delete-account').send({ password })).status).toBe(204);
    expect(await prisma.privateMessage.count()).toBe(0);
  });

  it('pede o aceite de ambas as partes antes de abrir a conversa', async () => {
    await prisma.user.update({ where: { id: professionalId }, data: { privacyVersion: '2026-11.10' } });
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    expect((await patient.get('/messages')).body[0].available).toBe(false);
    expect((await patient.post(`/messages/${linkId}`).send(input)).status).toBe(403);
    expect((await professional.get('/messages')).body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });

  it('envia avisos neutros ao destinatário e respeita os canais desligados', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const subscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/mensagens-teste',
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: Buffer.alloc(16, 7).toString('base64url'),
    };
    const { endpoint, ...keys } = subscription;
    expect((await professional.post('/reminders/push-subscriptions').send({ endpoint, keys })).status).toBe(200);
    mailer.sent.length = 0;
    const url = `/messages/${linkId}`;
    expect((await professional.get('/messages/preferences')).body).toMatchObject({ email: true, push: true });
    expect((await patient.post(url).send(input)).status).toBe(201);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.lastTo(professionalEmail)?.text).toContain('/mensagens');
    expect(mailer.lastTo(professionalEmail)?.text).not.toContain(text);
    expect(mailer.lastTo(professionalEmail)?.html).not.toContain(text);
    expect(pushSender.sent).toEqual([{ target: expect.objectContaining(subscription), message: {
      title: 'Você tem uma nova mensagem no Faísca', body: 'Abra o Faísca para ver sua mensagem.', url: '/mensagens',
      tag: 'faisca-messages',
    } }]);
    expect((await professional.put('/messages/preferences').send({ email: false, push: false })).status).toBe(204);
    expect((await patient.post(url).send(input)).status).toBe(201);
    expect(mailer.sent).toHaveLength(1);
    expect(pushSender.sent).toHaveLength(1);
  });
});

describe('mensagem nova e prévia (DEC-127)', () => {
  it('cada pessoa tem o próprio "visto"; quem enviou não vê o "visto" da outra', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const url = `/messages/${linkId}`;
    expect((await patient.get('/messages/unread')).body).toEqual({ unread: false });

    const sent = await professional.post(url).send({ topic: 'LOGISTICA', body: '  Podemos   mudar para 15h?  ' });
    expect((await patient.get('/messages/unread')).body).toEqual({ unread: true });
    expect((await professional.get('/messages/unread')).body).toEqual({ unread: false });
    const [conversation] = (await patient.get('/messages')).body;
    expect(conversation).toMatchObject({ unread: true, lastMessage: { preview: 'Podemos mudar para 15h?', mine: false } });

    expect((await patient.put(`${url}/seen`).send({ lastMessageId: sent.body.id })).status).toBe(204);
    expect((await patient.get('/messages/unread')).body).toEqual({ unread: false });
    expect((await patient.get('/messages')).body[0]).toMatchObject({ unread: false });

    // Quem enviou nunca recebe o "visto" da outra pessoa (sem recibo de leitura, DEC-125).
    const forProfessional = (await professional.get('/messages')).body[0];
    expect(forProfessional).toMatchObject({ unread: false, lastMessage: { mine: true } });
    expect(JSON.stringify(forProfessional)).not.toMatch(/seen/i);
    expect(JSON.stringify((await professional.get(url)).body)).not.toMatch(/seen/i);
  });

  it('o "visto" só avança e só aceita mensagem da própria conversa', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const url = `/messages/${linkId}`;
    const first = (await professional.post(url).send(input)).body.id as string;
    const second = (await professional.post(url).send({ topic: 'DUVIDA', body: 'Mais uma dúvida fictícia.' })).body.id as string;
    expect((await patient.put(`${url}/seen`).send({ lastMessageId: second })).status).toBe(204);
    expect((await patient.put(`${url}/seen`).send({ lastMessageId: first })).status).toBe(204);
    expect((await patient.get('/messages/unread')).body).toEqual({ unread: false });

    expect((await patient.put(`${url}/seen`).send({ lastMessageId: '00000000-0000-4000-8000-000000000000' })).status).toBe(400);
    expect((await patient.put(`${url}/seen`).send({ lastMessageId: first, extra: true })).status).toBe(400);
    const link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.therapistMessagesSeenAt).toBeNull();
  });

  it('autorização: sem sessão, outra profissional e vínculo revogado não marcam nem leem', async () => {
    const professional = await login(professionalEmail);
    const stranger = await login(strangerEmail);
    const url = `/messages/${linkId}`;
    const id = (await professional.post(url).send(input)).body.id as string;
    expect((await request(app).put(`${url}/seen`).send({ lastMessageId: id })).status).toBe(401);
    expect((await request(app).get('/messages/unread')).status).toBe(401);
    expect((await stranger.put(`${url}/seen`).send({ lastMessageId: id })).status).toBe(403);
    expect((await stranger.get('/messages/unread')).body).toEqual({ unread: false });

    const patient = await login(patientEmail);
    await prisma.therapistLink.update({ where: { id: linkId }, data: { revokedAt: new Date() } });
    expect((await patient.put(`${url}/seen`).send({ lastMessageId: id })).status).toBe(403);
    expect((await patient.get('/messages/unread')).body).toEqual({ unread: false });
  });

  it('sem o aceite das Mensagens: nem prévia, nem selo', async () => {
    const professional = await login(professionalEmail);
    await professional.post(`/messages/${linkId}`).send(input);
    await prisma.user.updateMany({ where: { email: patientEmail }, data: { privacyVersion: '2026-11.10' } });
    const patient = await login(patientEmail);
    expect((await patient.get('/messages/unread')).status).toBe(403);
    expect((await professional.get('/messages')).body[0]).toMatchObject({ available: false, unread: false, lastMessage: null });
  });

  it('a profissional grava só o próprio "visto"; os dois abrindo juntos não travam', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const url = `/messages/${linkId}`;
    const fromPatient = (await patient.post(url).send(input)).body.id as string;
    expect((await professional.get('/messages/unread')).body).toEqual({ unread: true });
    expect((await professional.put(`${url}/seen`).send({ lastMessageId: fromPatient })).status).toBe(204);
    let link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.therapistMessagesSeenAt).not.toBeNull();
    expect(link.patientMessagesSeenAt).toBeNull();
    expect((await professional.get('/messages/unread')).body).toEqual({ unread: false });

    const fromProfessional = (await professional.post(url).send({ topic: 'DUVIDA', body: 'Resposta fictícia.' })).body.id as string;
    const both = await Promise.all([
      patient.put(`${url}/seen`).send({ lastMessageId: fromProfessional }),
      professional.put(`${url}/seen`).send({ lastMessageId: fromProfessional }),
    ]);
    expect(both.map((res) => res.status)).toEqual([204, 204]);
    link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.patientMessagesSeenAt).not.toBeNull();
  });

  it('mensagem de outra conversa da mesma pessoa não marca o "visto"', async () => {
    const other = await createConfirmedUser({ email: 'mensagens-outro-paciente@faisca.test', privacyVersion: MESSAGES_PRIVACY_VERSION });
    const otherLink = await createTestLink({ patientId: other.id, therapistId: professionalId, kind: 'PSIQUIATRIA', sharedAreas: [] });
    const otherPatient = await login('mensagens-outro-paciente@faisca.test');
    const foreign = (await otherPatient.post(`/messages/${otherLink.id}`).send(input)).body.id as string;
    const professional = await login(professionalEmail);
    expect((await professional.put(`/messages/${linkId}/seen`).send({ lastMessageId: foreign })).status).toBe(400);
    const link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.therapistMessagesSeenAt).toBeNull();
  });
});
