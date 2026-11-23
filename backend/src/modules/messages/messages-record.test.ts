import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { runInline } from '../../lib/background.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { FakePushSender } from '../../test/fake-push-sender.js';
import { MESSAGES_PRIVACY_VERSION } from '../auth/privacy.js';

// Assunto "Sobre um registro" (DEC-128): a mensagem guarda só a referência, e a API confere o acesso
// a cada leitura (regra 1).
const patientEmail = 'registro-paciente@faisca.test';
const professionalEmail = 'registro-profissional@faisca.test';
const otherPatientEmail = 'registro-outro@faisca.test';
const password = 'senha-ficticia-123';
let app: ReturnType<typeof createApp>;
let mailer: FakeMailer;
let linkId: string;
let patientId: string;
let professionalId: string;
let activityId: string;
let thoughtId: string;
let foreignActivityId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer, pushSender: new FakePushSender(), runAfterResponse: runInline });
  patientId = (await createConfirmedUser({ email: patientEmail, privacyVersion: MESSAGES_PRIVACY_VERSION })).id;
  professionalId = (await createConfirmedUser({
    email: professionalEmail, patient: false, therapist: true, privacyVersion: MESSAGES_PRIVACY_VERSION,
  })).id;
  const otherId = (await createConfirmedUser({ email: otherPatientEmail, privacyVersion: MESSAGES_PRIVACY_VERSION })).id;
  // Só Atividades liberadas para a profissional; Pensamentos, não.
  linkId = (await createTestLink({ patientId, therapistId: professionalId, sharedAreas: ['ACTIVITIES'] })).id;
  const today = dateOnlyToDate(todayInAppZone());
  activityId = (await prisma.activity.create({ data: { userId: patientId, name: 'Caminhada fictícia', activityDate: today, status: 'PLANEJADA' } })).id;
  thoughtId = (await prisma.thoughtRecord.create({ data: {
    userId: patientId, situationDate: today, situation: 'Situação fictícia', automaticThought: 'Pensamento fictício',
    beliefLevel: 5, behavior: 'Ação fictícia', consequence: 'Desfecho fictício',
  } })).id;
  foreignActivityId = (await prisma.activity.create({ data: { userId: otherId, name: 'Atividade de outra pessoa', activityDate: today, status: 'PLANEJADA' } })).id;
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password })).status).toBe(200);
  return agent;
}
const about = (type: string, id: string) => ({ topic: 'REGISTRO', body: 'Dúvida fictícia sobre este registro.', record: { type, id } });

describe('mensagem "Sobre um registro" (DEC-128)', () => {
  it('o paciente aponta um registro de área liberada; os dois veem o cartão, e o e-mail segue neutro', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const [conversation] = (await patient.get('/messages')).body;
    expect(conversation).toMatchObject({ recordTopics: true, recordTypes: ['ACTIVITY'] });
    expect((await professional.get('/messages')).body[0]).toMatchObject({ recordTopics: false, recordTypes: [] });

    const sent = await patient.post(`/messages/${linkId}`).send(about('ACTIVITY', activityId));
    expect(sent.status).toBe(201);
    expect(sent.body.record).toMatchObject({ type: 'ACTIVITY', id: activityId, title: 'Caminhada fictícia' });
    const seen = (await professional.get(`/messages/${linkId}`)).body.messages[0];
    expect(seen).toMatchObject({ topic: 'REGISTRO', record: { type: 'ACTIVITY', id: activityId, title: 'Caminhada fictícia' } });

    // Regra 3: o aviso não cita o registro nem o texto.
    expect(JSON.stringify(mailer.sent)).not.toContain('Caminhada');
    expect(JSON.stringify(mailer.sent)).not.toContain('Dúvida fictícia');

    // A profissional responde sobre o mesmo registro.
    expect((await professional.post(`/messages/${linkId}`).send({ ...about('ACTIVITY', activityId), body: 'Resposta fictícia.' })).status).toBe(201);
  });

  it('nega: área não liberada, registro de outra pessoa, inexistente e assunto sem a referência', async () => {
    const patient = await login(patientEmail);
    const url = `/messages/${linkId}`;
    expect((await patient.post(url).send(about('THOUGHT_RECORD', thoughtId))).body.error.code).toBe('RECORD_NOT_SHARED');
    expect((await patient.post(url).send(about('ACTIVITY', foreignActivityId))).status).toBe(404);
    expect((await patient.post(url).send(about('ACTIVITY', '00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    expect((await patient.post(url).send({ topic: 'REGISTRO', body: 'Sem referência.' })).status).toBe(400);
    expect((await patient.post(url).send({ topic: 'DUVIDA', body: 'Com referência.', record: { type: 'ACTIVITY', id: activityId } })).status).toBe(400);
    expect(await prisma.privateMessage.count()).toBe(0);
  });

  it('a profissional não aponta registro novo; só responde sobre o que o paciente apontou', async () => {
    const professional = await login(professionalEmail);
    const res = await professional.post(`/messages/${linkId}`).send(about('ACTIVITY', activityId));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RECORD_NOT_SHARED');
  });

  it('a profissional que desliga a opção não recebe o assunto; o paciente deixa de ver a opção', async () => {
    const professional = await login(professionalEmail);
    expect((await professional.get('/messages/preferences')).body).toMatchObject({ recordTopics: true });
    expect((await professional.put('/messages/preferences').send({ email: true, push: true, recordTopics: false })).status).toBe(204);
    const patient = await login(patientEmail);
    expect((await patient.get('/messages')).body[0]).toMatchObject({ recordTopics: false, recordTypes: [] });
    const res = await patient.post(`/messages/${linkId}`).send(about('ACTIVITY', activityId));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RECORD_TOPIC_DISABLED');
  });

  it('conferido a cada leitura: área retirada ou registro apagado viram "indisponível" para a profissional', async () => {
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    await patient.post(`/messages/${linkId}`).send(about('ACTIVITY', activityId));

    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: [] } });
    const hidden = (await professional.get(`/messages/${linkId}`)).body.messages[0];
    expect(hidden.record).toEqual({ unavailable: true });
    expect(JSON.stringify(hidden)).not.toContain('Caminhada');
    // O paciente continua vendo o próprio registro.
    expect((await patient.get(`/messages/${linkId}`)).body.messages[0].record).toMatchObject({ id: activityId });

    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['ACTIVITIES'] } });
    await prisma.activity.delete({ where: { id: activityId } });
    expect((await professional.get(`/messages/${linkId}`)).body.messages[0].record).toEqual({ unavailable: true });
    expect((await patient.get(`/messages/${linkId}`)).body.messages[0].record).toEqual({ unavailable: true });
  });

  it('o CHECK do banco barra assunto e referência fora da regra', async () => {
    await expect(prisma.privateMessage.create({ data: { linkId, sentByPatient: true, topic: 'REGISTRO', body: 'Sem referência.' } })).rejects.toThrow();
    await expect(prisma.privateMessage.create({ data: {
      linkId, sentByPatient: true, topic: 'DUVIDA', body: 'Com referência.', recordType: 'ACTIVITY', recordId: activityId,
    } })).rejects.toThrow();
  });

  it('nega sem o aceite da área de um dos dois, e a resposta dela depois que a área sai', async () => {
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['ACTIVITIES', 'THOUGHT_RECORDS'] } });
    const patient = await login(patientEmail);
    const professional = await login(professionalEmail);
    const url = `/messages/${linkId}`;
    expect((await patient.post(url).send(about('THOUGHT_RECORD', thoughtId))).status).toBe(201);
    // A versão do aviso só avança: quem não tem o aceite do RPD também não tem o das Mensagens, e a
    // conversa inteira fecha (403), sem mostrar nada do registro.
    await prisma.user.update({ where: { id: professionalId }, data: { privacyVersion: '2026-10' } });
    expect((await patient.post(url).send(about('THOUGHT_RECORD', thoughtId))).status).toBe(403);
    expect((await professional.get(url)).status).toBe(403);
    await prisma.user.update({ where: { id: professionalId }, data: { privacyVersion: MESSAGES_PRIVACY_VERSION } });

    await patient.post(url).send(about('ACTIVITY', activityId));
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: [] } });
    const reply = await professional.post(url).send({ ...about('ACTIVITY', activityId), body: 'Resposta fictícia.' });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe('RECORD_NOT_SHARED');
  });

  it('registro apontado em outro vínculo dela não serve para responder aqui; vínculo revogado não lê', async () => {
    const other = await createConfirmedUser({ email: 'registro-segundo@faisca.test', privacyVersion: MESSAGES_PRIVACY_VERSION });
    const otherLink = await createTestLink({ patientId: other.id, therapistId: professionalId, sharedAreas: ['ACTIVITIES'] });
    const otherActivity = await prisma.activity.create({ data: { userId: other.id, name: 'Outra atividade fictícia', activityDate: dateOnlyToDate(todayInAppZone()), status: 'PLANEJADA' } });
    const secondPatient = await login('registro-segundo@faisca.test');
    expect((await secondPatient.post(`/messages/${otherLink.id}`).send(about('ACTIVITY', otherActivity.id))).status).toBe(201);

    const professional = await login(professionalEmail);
    expect((await professional.post(`/messages/${linkId}`).send(about('ACTIVITY', otherActivity.id))).status).toBe(403);

    await prisma.therapistLink.update({ where: { id: otherLink.id }, data: { revokedAt: new Date() } });
    expect((await professional.get(`/messages/${otherLink.id}`)).status).toBe(403);
    expect((await secondPatient.get(`/messages/${otherLink.id}`)).status).toBe(403);
  });

  it('com só "Sono e humor" liberada, um dia que só tem o remédio não vira registro apontável', async () => {
    await prisma.therapistLink.update({ where: { id: linkId }, data: { sharedAreas: ['SLEEP_MOOD'] } });
    const onlyMedication = await prisma.dailyCheckIn.create({ data: { userId: patientId, checkInDate: dateOnlyToDate(todayInAppZone()), medication: 'TOMOU' } });
    const patient = await login(patientEmail);
    expect((await patient.post(`/messages/${linkId}`).send(about('SLEEP_MOOD', onlyMedication.id))).status).toBe(404);
  });
});
