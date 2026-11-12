import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { runInline } from '../../lib/background.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { SHARED_AREAS } from '../../lib/shared-areas.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Várias profissionais e áreas liberadas por vínculo (#170, DEC-097). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const PSYCHOLOGIST = 'psicologa@faisca.test';
const PSYCHIATRIST = 'psiquiatra@faisca.test';

let app: ReturnType<typeof createApp>;
let mailer: FakeMailer;
let patientId: string;
let otherPatientId: string;
let psychologistId: string;
let psychiatristId: string;
let psychologistLinkId: string;
let psychiatristLinkId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer, runAfterResponse: runInline });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  psychologistId = (await createConfirmedUser({ email: PSYCHOLOGIST, patient: false, therapist: true })).id;
  psychiatristId = (
    await createConfirmedUser({ email: PSYCHIATRIST, patient: false, therapist: true, professionalKind: 'PSIQUIATRIA' })
  ).id;
  // A psicóloga, como os vínculos de antes da DEC-097, vê tudo; a psiquiatra começa sem nada.
  psychologistLinkId = (await createTestLink({ patientId, therapistId: psychologistId })).id;
  psychiatristLinkId = (
    await createTestLink({ patientId, therapistId: psychiatristId, kind: 'PSIQUIATRIA', sharedAreas: [] })
  ).id;
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const range = () => `from=${addDays(today(), -6)}&to=${today()}`;
const base = (id = patientId) => `/therapist/patients/${id}`;

function seedTension(userId = patientId) {
  return prisma.tensionEpisode.create({
    data: {
      userId,
      episodeDate: dateOnlyToDate(today()),
      situation: 'Situação fictícia',
      tensionLevel: 5,
      vocalizeUrge: 4,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
    },
  });
}

function seedThought(userId = patientId) {
  return prisma.thoughtRecord.create({
    data: {
      userId,
      situationDate: dateOnlyToDate(today()),
      situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício',
      beliefLevel: 7,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
    },
  });
}

async function share(areas: string[], linkId = psychiatristLinkId) {
  const res = await (await loginAgent(PATIENT)).put(`/link/${linkId}/areas`).send({ areas });
  expect(res.status).toBe(200);
  return res;
}

describe('áreas liberadas por vínculo (regra 1, DEC-097)', () => {
  it('vínculo sem área: a psiquiatra vê só o resumo, sem a agenda, e 403 em todas as áreas', async () => {
    const psychiatrist = await loginAgent(PSYCHIATRIST);

    const summary = await psychiatrist.get(base());
    expect(summary.status).toBe(200);
    expect(summary.body.access).toEqual({ kind: 'PSIQUIATRIA', sharedAreas: [] });
    expect(summary.body.lastAppointment).toBeNull();
    expect(summary.body.nextAppointment).toBeNull();

    for (const path of [
      `${base()}/activities?${range()}`,
      `${base()}/thought-records?${range()}`,
      `${base()}/tension-episodes?${range()}`,
      `${base()}/actions?${range()}`,
      `${base()}/about-me`,
      `${base()}/appointments`,
      `${base()}/cycle`,
      `${base()}/plans`,
    ]) {
      const res = await psychiatrist.get(path);
      expect(res.status, path).toBe(403);
      expect(res.body.error.code, path).toBe('FORBIDDEN');
    }
    // O "Para ler" não traz nenhuma área.
    const unread = await psychiatrist.get(`${base()}/unread`);
    expect(unread.status).toBe(200);
    expect(unread.body.counts).toEqual({
      thoughtRecords: null,
      tensionEpisodes: null,
      actions: null,
      aboutMe: null,
      planEntries: null,
    });
  });

  it('o paciente libera uma área: só ela abre para a psiquiatra, e a psicóloga segue com tudo', async () => {
    await seedThought();
    await seedTension();
    await share(['THOUGHT_RECORDS']);
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    const psychologist = await loginAgent(PSYCHOLOGIST);

    expect((await psychiatrist.get(`${base()}/thought-records?${range()}`)).status).toBe(200);
    expect((await psychiatrist.get(`${base()}/tension-episodes?${range()}`)).status).toBe(403);
    expect((await psychologist.get(`${base()}/tension-episodes?${range()}`)).status).toBe(200);

    // No "Para ler" e na lista de pacientes, só o que foi liberado conta.
    const unread = await psychiatrist.get(`${base()}/unread`);
    expect(unread.body.counts.thoughtRecords).toBe(1);
    expect(unread.body.counts.tensionEpisodes).toBeNull();
    expect((await psychiatrist.get('/links/patients')).body.patients[0].unreadCount).toBe(1);
    expect((await psychologist.get('/links/patients')).body.patients[0].unreadCount).toBe(2);
  });

  it('desmarcar tira o acesso na hora', async () => {
    await share(['THOUGHT_RECORDS']);
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    expect((await psychiatrist.get(`${base()}/thought-records?${range()}`)).status).toBe(200);

    await share([]);

    expect((await psychiatrist.get(`${base()}/thought-records?${range()}`)).status).toBe(403);
  });

  it('as fotos da Ação pedem a Ação e as fotos', async () => {
    await share(['ACTIONS']);
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    const photo = `${base()}/actions/00000000-0000-4000-8000-000000000001/photos/00000000-0000-4000-8000-000000000002`;

    expect((await psychiatrist.get(photo)).status).toBe(403);
    expect((await psychiatrist.get(`${base()}/actions?${range()}`)).status).toBe(200);
  });

  it('sem a agenda e as fotos liberadas, as listas não mostram as consultas nem as fotos', async () => {
    // Uma consulta daqui a 3 dias: o prazo da explicação alternativa e o das fotos apontariam para ela.
    await prisma.appointment.create({
      data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today(), 3)) },
    });
    await seedThought();
    const action = await prisma.behavioralAction.create({
      data: {
        userId: patientId,
        actionDate: dateOnlyToDate(today()),
        name: 'Ação fictícia',
        category: 'PRAZER',
        status: 'AVALIADA',
        expectation: 3,
        pleasure: 6,
        achievement: 5,
        evaluatedAt: new Date(),
      },
    });
    await prisma.actionPhoto.create({
      data: { actionId: action.id, image: new Uint8Array([1]), thumbnail: new Uint8Array([1]) },
    });
    await share(['THOUGHT_RECORDS', 'ACTIONS']);
    const psychiatrist = await loginAgent(PSYCHIATRIST);

    const thoughts = (await psychiatrist.get(`${base()}/thought-records?${range()}`)).body.thoughtRecords;
    expect(thoughts[0]).toEqual(expect.objectContaining({ alternativeDeadline: null, canAddAlternative: false }));
    const actions = (await psychiatrist.get(`${base()}/actions?${range()}`)).body.actions;
    expect(actions[0]).toEqual(expect.objectContaining({ photos: [], photosDeadline: null, photosOpen: false }));
    const unread = (await psychiatrist.get(`${base()}/unread`)).body;
    expect(unread.thoughtRecords[0].alternativeDeadline).toBeNull();
    expect(unread.actions[0].photos).toEqual([]);

    // Com a agenda e as fotos liberadas, voltam (caso permitido).
    await share(['THOUGHT_RECORDS', 'ACTIONS', 'ACTION_PHOTOS', 'APPOINTMENTS']);
    const open = (await psychiatrist.get(`${base()}/thought-records?${range()}`)).body.thoughtRecords;
    expect(open[0].alternativeDeadline).not.toBeNull();
    const withPhotos = (await psychiatrist.get(`${base()}/actions?${range()}`)).body.actions;
    expect(withPhotos[0].photos).toHaveLength(1);
    expect(withPhotos[0].photosDeadline).not.toBeNull();
  });

  it('marcar como lido um registro de área não liberada: 403, sem gravar', async () => {
    const episode = await seedTension();
    await share(['THOUGHT_RECORDS']);

    const res = await (await loginAgent(PSYCHIATRIST))
      .put(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'TENSION_EPISODE', id: episode.id }] });

    expect(res.status).toBe(403);
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('cada profissional tem as próprias marcas de leitura', async () => {
    const thought = await seedThought();
    await share(['THOUGHT_RECORDS']);
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    await psychiatrist
      .put(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'THOUGHT_RECORD', id: thought.id }] });

    expect((await psychiatrist.get(`${base()}/unread`)).body.counts.thoughtRecords).toBe(0);
    expect((await (await loginAgent(PSYCHOLOGIST)).get(`${base()}/unread`)).body.counts.thoughtRecords).toBe(1);
  });

  it('a profissional nunca escreve nos dados do paciente, nem com a área liberada', async () => {
    await share([...SHARED_AREAS]);
    const psychiatrist = await loginAgent(PSYCHIATRIST);

    for (const res of [
      await psychiatrist.post(`${base()}/thought-records`).send({}),
      await psychiatrist.patch(`${base()}/plans`).send({}),
      await psychiatrist.delete(`${base()}/tension-episodes`),
    ]) {
      expect(res.status).toBe(403);
    }
  });
});

describe('o paciente escolhe o que cada profissional vê', () => {
  it('só o próprio paciente muda as áreas, no próprio vínculo', async () => {
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    expect((await psychiatrist.put(`/link/${psychiatristLinkId}/areas`).send({ areas: ['ACTIVITIES'] })).status).toBe(
      403,
    );

    const other = await loginAgent(OTHER_PATIENT);
    const foreign = await other.put(`/link/${psychiatristLinkId}/areas`).send({ areas: ['ACTIVITIES'] });
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe('LINK_NOT_FOUND');

    const link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychiatristLinkId } });
    expect(link.sharedAreas).toEqual([]);
  });

  it('área inválida, repetida ou campo a mais: 400', async () => {
    const patient = await loginAgent(PATIENT);
    const path = `/link/${psychiatristLinkId}/areas`;
    expect((await patient.put(path).send({ areas: ['TUDO'] })).status).toBe(400);
    expect((await patient.put(path).send({ areas: ['ACTIVITIES', 'ACTIVITIES'] })).status).toBe(400);
    expect((await patient.put(path).send({ areas: [], patientId: otherPatientId })).status).toBe(400);
    expect((await patient.put('/link/nao-e-uuid/areas').send({ areas: [] })).status).toBe(400);
  });

  it('o status lista as duas profissionais, a psicóloga primeiro, com o tipo e as áreas', async () => {
    await share(['THOUGHT_RECORDS']);
    const res = await (await loginAgent(PATIENT)).get('/link');

    expect(res.body.links.map((link: { kind: string }) => link.kind)).toEqual(['PSICOLOGIA', 'PSIQUIATRIA']);
    expect(res.body.links[1]).toEqual(
      expect.objectContaining({ id: psychiatristLinkId, sharedAreas: ['THOUGHT_RECORDS'] }),
    );
    expect(res.body.link.id).toBe(psychologistLinkId);
  });
});

describe('desfazer um vínculo', () => {
  it('desfazer um não mexe no outro', async () => {
    const patient = await loginAgent(PATIENT);
    expect((await patient.post('/link/revoke').send({ linkId: psychiatristLinkId })).status).toBe(204);

    expect((await (await loginAgent(PSYCHIATRIST)).get(base())).status).toBe(403);
    expect((await (await loginAgent(PSYCHOLOGIST)).get(base())).status).toBe(200);
  });

  it('com duas profissionais, desfazer sem dizer qual: 400; vínculo de outra pessoa: 404', async () => {
    const patient = await loginAgent(PATIENT);
    const missing = await patient.post('/link/revoke').send({});
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('LINK_ID_REQUIRED');

    const other = await loginAgent(OTHER_PATIENT);
    expect((await other.post('/link/revoke').send({ linkId: psychiatristLinkId })).status).toBe(404);
    expect(await prisma.therapistLink.count({ where: { revokedAt: null } })).toBe(2);
  });
});

describe('tipo de profissional e conselho', () => {
  it('a profissional informa o conselho; trocar o tipo com vínculo ativo dá 409', async () => {
    const psychiatrist = await loginAgent(PSYCHIATRIST);

    const saved = await psychiatrist.patch('/profile').send({ professional: { councilNumber: '  CRM 12345  ' } });
    expect(saved.status).toBe(200);
    expect(saved.body.profile.professional).toEqual({ kind: 'PSIQUIATRIA', councilNumber: 'CRM 12345' });

    const locked = await psychiatrist.patch('/profile').send({ professional: { kind: 'PSICOLOGIA' } });
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('PROFESSIONAL_KIND_LOCKED');

    expect((await psychiatrist.patch('/profile').send({ professional: { councilNumber: 'x'.repeat(31) } })).status).toBe(
      400,
    );
  });

  it('sem vínculo ativo, troca o tipo; quem não é profissional não tem esses dados', async () => {
    await prisma.therapistLink.updateMany({ where: { therapistId: psychiatristId }, data: { revokedAt: new Date() } });
    const psychiatrist = await loginAgent(PSYCHIATRIST);
    const changed = await psychiatrist.patch('/profile').send({ professional: { kind: 'PSICOLOGIA' } });
    expect(changed.body.profile.professional.kind).toBe('PSICOLOGIA');

    const patient = await loginAgent(PATIENT);
    expect((await patient.patch('/profile').send({ professional: { kind: 'PSIQUIATRIA' } })).status).toBe(403);
  });

  it('quem liga o perfil de terapeuta fica com o tipo que pediu agora', async () => {
    const someone = await createConfirmedUser({ email: 'alguem@faisca.test', patient: true, therapist: false });
    await prisma.user.update({ where: { id: someone.id }, data: { professionalKind: 'PSICOLOGIA' } });

    const res = await (await loginAgent('alguem@faisca.test'))
      .post('/auth/profiles')
      .send({ profile: 'therapist', professionalKind: 'PSIQUIATRIA' });

    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: someone.id } })).professionalKind).toBe('PSIQUIATRIA');
  });

  it('quem aceita o convite como psiquiatra vira psiquiatra, e o vínculo também', async () => {
    await prisma.therapistLink.updateMany({ where: { therapistId: psychiatristId }, data: { revokedAt: new Date() } });
    const newcomer = await createConfirmedUser({ email: 'nova@faisca.test', patient: true, therapist: false });
    const invite = await (await loginAgent(PATIENT)).post('/link/invite').send({ email: 'nova@faisca.test' });
    expect(invite.status).toBe(201);
    const token = mailer.lastTokenTo('nova@faisca.test');

    const res = await (await loginAgent('nova@faisca.test'))
      .post('/links/accept-invite')
      .send({ token, professionalKind: 'PSIQUIATRIA' });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: newcomer.id } });
    expect(user).toMatchObject({ hasTherapistProfile: true, professionalKind: 'PSIQUIATRIA' });
    const link = await prisma.therapistLink.findFirstOrThrow({ where: { therapistId: newcomer.id } });
    expect(link).toMatchObject({ kind: 'PSIQUIATRIA', sharedAreas: [] });
  });

  it('a segunda psicóloga não entra: 409, e nada muda', async () => {
    const second = await createConfirmedUser({ email: 'segunda@faisca.test', patient: false, therapist: true });
    await prisma.therapistLink.updateMany({ where: { therapistId: psychiatristId }, data: { revokedAt: new Date() } });
    const code = (await (await loginAgent(PATIENT)).post('/link/code')).body.code as string;

    const res = await (await loginAgent('segunda@faisca.test')).post('/links/redeem-code').send({ code });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PATIENT_ALREADY_LINKED');
    expect(res.body.error.message).toContain('psicóloga');
    expect(await prisma.therapistLink.count({ where: { therapistId: second.id } })).toBe(0);
  });
});

describe('mural e foto com duas profissionais', () => {
  it('o paciente vê os avisos das duas', async () => {
    await (await loginAgent(PSYCHOLOGIST)).post('/therapist/notices').send({ body: 'Aviso fictício da psicóloga' });
    await (await loginAgent(PSYCHIATRIST)).post('/therapist/notices').send({ body: 'Aviso fictício da psiquiatra' });

    const res = await (await loginAgent(PATIENT)).get('/notices');

    expect(res.body.notices).toHaveLength(2);
    expect(res.body.unseenCount).toBe(2);
  });

  it('a foto de uma profissional só pelo vínculo do próprio paciente', async () => {
    const other = await loginAgent(OTHER_PATIENT);
    expect((await other.get(`/link/${psychiatristLinkId}/avatar`)).status).toBe(404);
  });
});
