import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente-comunidade@faisca.test';
const OTHER_PATIENT = 'outra-comunidade@faisca.test';
const THERAPIST = 'psicologa-comunidade@faisca.test';
const PSYCHIATRIST = 'psiquiatra-comunidade@faisca.test';
const MODERATOR = 'moderador@faisca.test';
const NO_2FA_MODERATOR = 'moderador-sem-2fa@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;
let communityId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ name: 'Paciente Fictícia', email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ name: 'Outra Paciente Fictícia', email: OTHER_PATIENT })).id;
  therapistId = (await createConfirmedUser({ name: 'Psicóloga Fictícia', email: THERAPIST, patient: false, therapist: true })).id;
  await createConfirmedUser({ name: 'Psiquiatra Fictícia', email: PSYCHIATRIST, patient: false, therapist: true, professionalKind: 'PSIQUIATRIA' });
  await createConfirmedUser({ name: 'Moderador Fictício', email: MODERATOR });
  await createConfirmedUser({ name: 'Moderador sem 2FA', email: NO_2FA_MODERATOR });
  await createTestLink({ patientId, therapistId });
  await createTestLink({ patientId: otherPatientId, therapistId });
  const community = await prisma.community.create({ data: { therapistId } });
  communityId = community.id;
});

async function login(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: PASSWORD })).status).toBe(200);
  return agent;
}

async function join(patient: ReturnType<typeof request.agent>, displayName = 'Sol') {
  return patient.post('/community/join').send({
    displayName,
    adultConfirmed: true,
    rulesAccepted: true,
    announceOnJoin: true,
  });
}

async function approve(patient = PATIENT) {
  const therapist = await login(THERAPIST);
  const state = await therapist.get('/therapist/community');
  const membership = state.body.requests.find((item: { patientId: string }) => item.patientId === (patient === PATIENT ? patientId : otherPatientId));
  return therapist.post(`/therapist/community/requests/${membership.id}/decision`).send({ decision: 'APPROVE' });
}

describe('comunidade (Issue #220, DEC-113)', () => {
  it('protege a entrada por perfil, vínculo psicológico ativo, aceite de privacidade e maioridade', async () => {
    expect((await request(app).get('/community')).status).toBe(401);
    const patient = await login(PATIENT);
    expect((await patient.get('/community')).body).toMatchObject({ available: true, community: { id: communityId }, membership: null });
    expect((await patient.post('/community/join').send({ displayName: 'Sol', adultConfirmed: false, rulesAccepted: true, announceOnJoin: false })).status).toBe(400);

    const oldConsent = await createConfirmedUser({ email: 'aviso-antigo-comunidade@faisca.test', privacyVersion: '2026-11.7' });
    await createTestLink({ patientId: oldConsent.id, therapistId });
    const oldPatient = await login('aviso-antigo-comunidade@faisca.test');
    expect((await oldPatient.get('/community')).status).toBe(403);

    const therapist = await login(THERAPIST);
    expect((await therapist.post('/community/join').send({})).status).toBe(403);
    const psychiatrist = await login(PSYCHIATRIST);
    expect((await psychiatrist.post('/therapist/community')).status).toBe(403);

    const unlinked = await createConfirmedUser({ email: 'sem-vinculo-comunidade@faisca.test' });
    const unlinkedPatient = await login('sem-vinculo-comunidade@faisca.test');
    expect((await unlinkedPatient.post('/community/join').send({ displayName: 'Lua', adultConfirmed: true, rulesAccepted: true, announceOnJoin: false })).status).toBe(404);
    expect(await prisma.communityMembership.count()).toBe(0);
    expect(unlinked.id).not.toBe(patientId);
  });

  it('a paciente pede entrada, a psicóloga aprova e a nova pessoa pode ver o histórico', async () => {
    const patient = await login(PATIENT);
    expect((await join(patient)).body.status).toBe('REQUESTED');
    expect((await patient.get('/community')).body.membership.status).toBe('REQUESTED');

    const therapist = await login(THERAPIST);
    const requestList = await therapist.get('/therapist/community');
    expect(requestList.body.requests).toEqual([expect.objectContaining({ patientId, patientName: 'Paciente Fictícia' })]);
    expect((await therapist.post(`/therapist/community/requests/${requestList.body.requests[0].id}/decision`).send({ decision: 'APPROVE' })).body.status).toBe('ACTIVE');

    const state = await patient.get('/community');
    expect(state.body.membership).toMatchObject({ status: 'ACTIVE', displayName: 'Sol', canSeeHistoryBeforeJoining: true });
    expect(state.body.feed.events).toEqual([expect.objectContaining({ body: 'Sol chegou à comunidade.' })]);
  });

  it('convite da psicóloga só alcança paciente com vínculo ativo e exige aceite explícito do paciente', async () => {
    const therapist = await login(THERAPIST);
    expect((await therapist.post('/therapist/community/invitations').send({ patientId })).status).toBe(201);
    const patient = await login(PATIENT);
    expect((await patient.get('/community')).body.membership.status).toBe('INVITED');
    expect((await join(patient, 'Lua')).body.status).toBe('ACTIVE');
    expect((await patient.get('/community')).body.membership.displayName).toBe('Lua');

    const noLink = await createConfirmedUser({ email: 'paciente-sem-link-comunidade@faisca.test' });
    const denied = await therapist.post('/therapist/community/invitations').send({ patientId: noLink.id });
    expect(denied.status).toBe(403);
  });

  it('mantém publicações pendentes invisíveis até revisão humana e limita o moderador à fila da comunidade', async () => {
    const patient = await login(PATIENT);
    await join(patient);
    await approve();

    const created = await patient.post('/community/posts').send({ body: 'Uma experiência fictícia que quero compartilhar.' });
    expect(created.status).toBe(201);
    expect(created.body.post.status).toBe('PENDING');
    expect((await patient.get('/community')).body.feed.posts).toHaveLength(0);
    expect((await patient.get('/community')).body.myContent[0].body).toContain('experiência fictícia');

    const noFactor = await login(NO_2FA_MODERATOR);
    await prisma.user.update({ where: { email: NO_2FA_MODERATOR }, data: { twoFactorEmail: false } });
    expect((await noFactor.get('/community/moderation')).status).toBe(403);

    const moderator = await login(MODERATOR);
    await prisma.user.update({ where: { email: MODERATOR }, data: { twoFactorEmail: true } });
    const queue = await moderator.get('/community/moderation');
    expect(queue.body.posts).toEqual([expect.objectContaining({ id: created.body.post.id, authorDisplayName: 'Sol', body: 'Uma experiência fictícia que quero compartilhar.' })]);
    expect(queue.body.posts[0]).not.toHaveProperty('authorId');
    expect((await moderator.get(`/therapist/patients/${patientId}`)).status).toBe(403);

    expect((await moderator.patch(`/community/moderation/posts/${created.body.post.id}`).send({ decision: 'APPROVE' })).body.post.status).toBe('PUBLISHED');
    const feed = (await patient.get('/community')).body.feed;
    expect(feed.posts).toHaveLength(1);
    expect(feed.posts[0]).toMatchObject({ authorDisplayName: 'Sol', body: 'Uma experiência fictícia que quero compartilhar.' });
    expect(JSON.stringify(feed)).not.toContain(PATIENT);
    expect(JSON.stringify(feed)).not.toContain(patientId);
  });

  it('edição volta à fila, denúncia permite ocultação e conteúdo removido não aparece no feed', async () => {
    const patient = await login(PATIENT);
    await join(patient);
    await approve();
    const other = await login(OTHER_PATIENT);
    await join(other, 'Nuvem');
    await approve(OTHER_PATIENT);

    const created = await other.post('/community/posts').send({ body: 'Relato fictício publicado.' });
    const moderator = await login(MODERATOR);
    await prisma.user.update({ where: { email: MODERATOR }, data: { twoFactorEmail: true } });
    expect((await moderator.patch(`/community/moderation/posts/${created.body.post.id}`).send({ decision: 'APPROVE' })).status).toBe(200);

    const edited = await other.patch(`/community/posts/${created.body.post.id}`).send({ body: 'Relato fictício atualizado.' });
    expect(edited.body.post.status).toBe('PENDING');
    expect((await patient.get('/community')).body.feed.posts).toHaveLength(0);
    expect((await moderator.patch(`/community/moderation/posts/${created.body.post.id}`).send({ decision: 'APPROVE' })).status).toBe(200);

    const post = (await patient.get('/community')).body.feed.posts[0];
    expect((await patient.post('/community/reports').send({ postId: post.id, reason: 'PRIVACY', details: 'Identifica outra pessoa fictícia.' })).status).toBe(201);
    const report = (await moderator.get('/community/moderation')).body.reports[0];
    expect(report.details).toBe('Identifica outra pessoa fictícia.');
    expect((await moderator.patch(`/community/moderation/reports/${report.id}`).send({ decision: 'HIDE' })).status).toBe(200);
    expect((await patient.get('/community')).body.feed.posts).toHaveLength(0);
  });

  it('sair bloqueia o feed, mas a pessoa pode apagar o próprio conteúdo depois', async () => {
    const patient = await login(PATIENT);
    await join(patient);
    await approve();
    const created = await patient.post('/community/posts').send({ body: 'Um relato fictício meu.' });
    const moderator = await login(MODERATOR);
    await prisma.user.update({ where: { email: MODERATOR }, data: { twoFactorEmail: true } });
    await moderator.patch(`/community/moderation/posts/${created.body.post.id}`).send({ decision: 'APPROVE' });

    expect((await patient.post('/community/leave')).status).toBe(204);
    expect((await patient.get('/community')).body.membership.status).toBe('LEFT');
    expect((await patient.delete(`/community/posts/${created.body.post.id}`)).status).toBe(204);
    expect((await prisma.communityPost.findUniqueOrThrow({ where: { id: created.body.post.id } })).body).toContain('apagada pela pessoa autora');
  });

  it('apagar a conta da psicóloga apaga a comunidade e todo o conteúdo em cascata', async () => {
    const patient = await login(PATIENT);
    await join(patient);
    await approve();
    await patient.post('/community/posts').send({ body: 'Conteúdo fictício que será apagado.' });
    await prisma.user.delete({ where: { id: therapistId } });
    expect(await prisma.community.count()).toBe(0);
    expect(await prisma.communityMembership.count()).toBe(0);
    expect(await prisma.communityPost.count()).toBe(0);
    expect(communityId).toBeTruthy();
  });
});
