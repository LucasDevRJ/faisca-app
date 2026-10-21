import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, timeOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { readStatusOf } from './read-marks.service.js';

// Marcas de leitura da terapeuta (SPEC, "Visão da terapeuta"; DEC-057). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';
const OLD_PRIVACY_THERAPIST = 'terapeuta-aviso-antigo@faisca.test';
const OLD_PRIVACY_PATIENT = 'paciente-da-terapeuta-antiga@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;
let oldPrivacyPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true });
  // Aceitou só a versão do aviso que cita o RPD: não pode marcar Tensão nem Ação.
  const oldPrivacyId = (
    await createConfirmedUser({
      email: OLD_PRIVACY_THERAPIST,
      patient: false,
      therapist: true,
      privacyVersion: '2026-10.2',
    })
  ).id;
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
  // Um vínculo ativo por paciente (DEC-031): a terapeuta do aviso antigo atende outra paciente.
  oldPrivacyPatientId = (await createConfirmedUser({ email: OLD_PRIVACY_PATIENT })).id;
  await prisma.therapistLink.create({ data: { patientId: oldPrivacyPatientId, therapistId: oldPrivacyId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const range = () => ({ from: addDays(today(), -30), to: today() });
const marks = (id = patientId) => `/therapist/read-marks/${id}`;
const base = (id = patientId) => `/therapist/patients/${id}`;

function seedThought(userId = patientId, createdAt = new Date()) {
  return prisma.thoughtRecord.create({
    data: {
      userId,
      situationDate: dateOnlyToDate(todayInAppZone(createdAt)),
      situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício',
      beliefLevel: 6,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      createdAt,
      emotions: { create: [{ emotion: 'ANSIEDADE', intensity: 7 }] },
    },
  });
}

function seedTension(userId = patientId) {
  return prisma.tensionEpisode.create({
    data: {
      userId,
      episodeDate: dateOnlyToDate(today()),
      episodeTime: timeOnlyToDate('09:00'),
      situation: 'Situação fictícia de tensão',
      tensionLevel: 6,
      vocalizeUrge: 4,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
    },
  });
}

function seedAction(userId = patientId) {
  return prisma.behavioralAction.create({
    data: { userId, actionDate: dateOnlyToDate(today()), name: 'Caminhada fictícia', category: 'PRAZER', expectation: 4 },
  });
}

const item = (type: string, id: string) => ({ type, id });

describe('autorização das marcas (regra 1, exceção da DEC-057)', () => {
  it('sem sessão: 401', async () => {
    const { id } = await seedThought();
    const put = await request(app).put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    const del = await request(app).delete(marks()).send({ items: [item('THOUGHT_RECORD', id)] });

    expect(put.status).toBe(401);
    expect(del.status).toBe(401);
  });

  it('conta só de paciente: 403, nada gravado', async () => {
    const { id } = await seedThought();
    const res = await (await loginAgent(PATIENT)).put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('THERAPIST_PROFILE_REQUIRED');
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('terapeuta sem vínculo, ou com o vínculo desfeito: 403, nada gravado nem apagado', async () => {
    const { id } = await seedThought();
    const outsider = await loginAgent(OTHER_THERAPIST);
    const other = await outsider.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect(other.status).toBe(403);

    // Nem desfazer a marca de outra terapeuta.
    await (await loginAgent(THERAPIST)).put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect((await outsider.delete(marks()).send({ items: [item('THOUGHT_RECORD', id)] })).status).toBe(403);
    expect(await prisma.readMark.count()).toBe(1);
    await prisma.readMark.deleteMany();

    await prisma.therapistLink.updateMany({ where: { therapistId }, data: { revokedAt: new Date() } });
    const revoked = await (await loginAgent(THERAPIST)).put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect(revoked.status).toBe(403);
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('registro de outro paciente, mesmo misturado com um válido: 403 e nada gravado', async () => {
    const mine = await seedThought();
    const theirs = await seedThought(otherPatientId);
    const agent = await loginAgent(THERAPIST);

    const res = await agent.put(marks()).send({
      items: [item('THOUGHT_RECORD', mine.id), item('THOUGHT_RECORD', theirs.id)],
    });
    // O registro existe, mas a área está errada: também não passa.
    const wrongType = await agent.put(marks()).send({ items: [item('ACTION', mine.id)] });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(wrongType.status).toBe(403);
    expect(await prisma.readMark.count()).toBe(0);
  });

  it('área sem o aceite do aviso: 403 PRIVACY_CONSENT_REQUIRED', async () => {
    const tension = await seedTension(oldPrivacyPatientId);
    const thought = await seedThought(oldPrivacyPatientId);
    const agent = await loginAgent(OLD_PRIVACY_THERAPIST);

    const blocked = await agent.put(marks(oldPrivacyPatientId)).send({ items: [item('TENSION_EPISODE', tension.id)] });
    const allowed = await agent.put(marks(oldPrivacyPatientId)).send({ items: [item('THOUGHT_RECORD', thought.id)] });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect(allowed.status).toBe(200);
  });

  it('o prefixo /therapist/patients continua só leitura', async () => {
    const res = await (await loginAgent(THERAPIST)).put(`${base()}/unread`).send({});
    expect(res.status).toBe(403);
  });

  it('o paciente não vê as marcas nas próprias rotas', async () => {
    const { id } = await seedThought();
    await (await loginAgent(THERAPIST)).put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });

    const res = await (await loginAgent(PATIENT)).get('/thought-records').query(range());
    expect(res.body.thoughtRecords[0]).not.toHaveProperty('readStatus');
    expect(res.body.thoughtRecords[0]).not.toHaveProperty('readAt');
  });

  it('valida o corpo', async () => {
    const { id } = await seedThought();
    const agent = await loginAgent(THERAPIST);
    const invalid = [
      {},
      { items: [] },
      { items: [item('ACTIVITY', id)] },
      { items: [item('THOUGHT_RECORD', 'nao-e-uuid')] },
      { items: [item('THOUGHT_RECORD', id), item('THOUGHT_RECORD', id)] },
      { items: Array.from({ length: 501 }, () => item('THOUGHT_RECORD', id)) },
    ];
    for (const body of invalid) {
      expect((await agent.put(marks()).send(body)).status, JSON.stringify(body).slice(0, 60)).toBe(400);
    }
  });
});

describe('status de leitura nas listas da terapeuta (DEC-057)', () => {
  it('não lido → lido → atualizado quando o paciente edita → não lido ao desmarcar', async () => {
    const { id } = await seedThought();
    const therapist = await loginAgent(THERAPIST);
    const list = async () =>
      (await therapist.get(`${base()}/thought-records`).query(range())).body.thoughtRecords[0];

    expect(await list()).toMatchObject({ readStatus: 'NAO_LIDO', readAt: null });

    const marked = await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect(marked.status).toBe(200);
    expect(marked.body.marked).toBe(1);
    expect(await list()).toMatchObject({ readStatus: 'LIDO', readAt: marked.body.readAt });

    // Edição no mesmo dia: volta a contar.
    await (await loginAgent(PATIENT)).patch(`/thought-records/${id}`).send({ beliefLevel: 2 });
    expect((await list()).readStatus).toBe('ATUALIZADO');

    const unmarked = await therapist.delete(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect(unmarked.body.unmarked).toBe(1);
    expect(await list()).toMatchObject({ readStatus: 'NAO_LIDO', readAt: null });
  });

  it('mudar só as emoções também conta como atualizado', async () => {
    const { id } = await seedThought();
    const therapist = await loginAgent(THERAPIST);
    await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });

    await (await loginAgent(PATIENT))
      .patch(`/thought-records/${id}`)
      .send({ emotions: [{ emotion: 'MEDO', intensity: 3 }] });

    const after = (await therapist.get(`${base()}/thought-records`).query(range())).body.thoughtRecords[0];
    expect(after.readStatus).toBe('ATUALIZADO');
  });

  it('dois "Marcar todos" ao mesmo tempo gravam uma marca só, sem erro', async () => {
    const { id } = await seedThought();
    const therapist = await loginAgent(THERAPIST);
    const body = { items: [item('THOUGHT_RECORD', id)] };

    const results = await Promise.all([therapist.put(marks()).send(body), therapist.put(marks()).send(body)]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.readMark.count()).toBe(1);
  });

  it('a Ação avaliada depois de lida e o episódio também ganham o status', async () => {
    const action = await seedAction();
    const tension = await seedTension();
    const therapist = await loginAgent(THERAPIST);

    await therapist.put(marks()).send({ items: [item('ACTION', action.id), item('TENSION_EPISODE', tension.id)] });
    await (await loginAgent(PATIENT)).post(`/actions/${action.id}/evaluate`).send({ pleasure: 7, achievement: 6 });

    const actions = (await therapist.get(`${base()}/actions`).query(range())).body.actions;
    const episodes = (await therapist.get(`${base()}/tension-episodes`).query(range())).body.tensionEpisodes;
    expect(actions[0].readStatus).toBe('ATUALIZADO');
    expect(episodes[0].readStatus).toBe('LIDO');
  });

  it('a explicação alternativa adicionada depois volta o registro a não lido', async () => {
    const { id } = await seedThought(patientId, new Date(Date.now() - 2 * 24 * 60 * 60 * 1000));
    await prisma.appointment.create({
      data: { userId: patientId, appointmentDate: dateOnlyToDate(addDays(today(), 1)), appointmentTime: timeOnlyToDate('10:00') },
    });
    const therapist = await loginAgent(THERAPIST);
    await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });

    const patient = await loginAgent(PATIENT);
    // A lista da paciente congela o prazo (DEC-054) sem mexer no updatedAt: continua lido.
    await patient.get('/thought-records').query(range());
    const afterFreeze = (await therapist.get(`${base()}/thought-records`).query(range())).body.thoughtRecords[0];
    expect(afterFreeze.readStatus).toBe('LIDO');

    await patient.post(`/thought-records/${id}/alternative`).send({ alternativeExplanation: 'Alternativa fictícia' });
    const after = (await therapist.get(`${base()}/thought-records`).query(range())).body.thoughtRecords[0];
    expect(after.readStatus).toBe('ATUALIZADO');
  });

  it('marcar de novo renova a data; com troca de terapeuta, a nova começa sem marcas', async () => {
    const { id } = await seedThought();
    const therapist = await loginAgent(THERAPIST);

    const first = await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    const second = await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', id)] });
    expect(second.body.readAt >= first.body.readAt).toBe(true);
    expect(await prisma.readMark.count()).toBe(1);

    // A paciente troca de terapeuta: as marcas são da terapeuta antiga, não do registro.
    await prisma.therapistLink.updateMany({ where: { patientId }, data: { revokedAt: new Date() } });
    const otherId = (await prisma.user.findUniqueOrThrow({ where: { email: OTHER_THERAPIST } })).id;
    await prisma.therapistLink.create({ data: { patientId, therapistId: otherId, method: 'CODE' } });
    const other = (await (await loginAgent(OTHER_THERAPIST)).get(`${base()}/thought-records`).query(range()))
      .body.thoughtRecords[0];
    expect(other.readStatus).toBe('NAO_LIDO');
  });
});

describe('visão "Não lidos" e contador (DEC-057)', () => {
  it('traz só o que falta ler, de qualquer data, com os contadores', async () => {
    const old = await seedThought(patientId, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
    const read = await seedThought();
    const tension = await seedTension();
    await seedAction();
    const therapist = await loginAgent(THERAPIST);
    await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', read.id), item('TENSION_EPISODE', tension.id)] });

    const res = await therapist.get(`${base()}/unread`);

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecords.map((r: { id: string }) => r.id)).toEqual([old.id]);
    expect(res.body.thoughtRecords[0].readStatus).toBe('NAO_LIDO');
    expect(res.body.tensionEpisodes).toEqual([]);
    expect(res.body.actions).toHaveLength(1);
    expect(res.body.counts).toEqual({ thoughtRecords: 1, tensionEpisodes: 0, actions: 1 });
  });

  it('área sem o aceite do aviso vem como null', async () => {
    await seedTension(oldPrivacyPatientId);
    const res = await (await loginAgent(OLD_PRIVACY_THERAPIST)).get(`${base(oldPrivacyPatientId)}/unread`);

    expect(res.status).toBe(200);
    expect(res.body.tensionEpisodes).toBeNull();
    expect(res.body.counts.tensionEpisodes).toBeNull();
  });

  it('paciente com o vínculo desfeito some da lista e do contador', async () => {
    await seedThought();
    await prisma.therapistLink.updateMany({ where: { patientId }, data: { revokedAt: new Date() } });

    const res = await (await loginAgent(THERAPIST)).get('/links/patients');

    expect(res.body.patients).toEqual([]);
  });

  it('terapeuta sem vínculo não vê os não lidos (403)', async () => {
    const res = await (await loginAgent(OTHER_THERAPIST)).get(`${base()}/unread`);
    expect(res.status).toBe(403);
  });

  it('a lista de pacientes traz o contador, só das áreas com aceite', async () => {
    for (const userId of [patientId, oldPrivacyPatientId]) {
      await seedThought(userId);
      await seedTension(userId);
      await seedAction(userId);
    }

    const full = await (await loginAgent(THERAPIST)).get('/links/patients');
    const old = await (await loginAgent(OLD_PRIVACY_THERAPIST)).get('/links/patients');

    expect(full.body.patients).toEqual([expect.objectContaining({ id: patientId, unreadCount: 3 })]);
    // Só o RPD conta para quem aceitou só a versão que o cita.
    expect(old.body.patients).toEqual([expect.objectContaining({ id: oldPrivacyPatientId, unreadCount: 1 })]);
  });
});

describe('cascata (LGPD)', () => {
  it('excluir o registro ou a conta apaga as marcas', async () => {
    const thought = await seedThought();
    const tension = await seedTension();
    const therapist = await loginAgent(THERAPIST);
    await therapist.put(marks()).send({ items: [item('THOUGHT_RECORD', thought.id), item('TENSION_EPISODE', tension.id)] });
    expect(await prisma.readMark.count()).toBe(2);

    await prisma.thoughtRecord.delete({ where: { id: thought.id } });
    expect(await prisma.readMark.count()).toBe(1);

    await prisma.user.delete({ where: { id: patientId } });
    expect(await prisma.readMark.count()).toBe(0);
  });
});

describe('o status, sem banco', () => {
  it('lido só quando a marca é igual ou posterior à última mudança', () => {
    const updatedAt = new Date('2026-10-20T12:00:00Z');
    expect(readStatusOf(undefined, updatedAt)).toBe('NAO_LIDO');
    expect(readStatusOf(new Date('2026-10-20T12:00:00Z'), updatedAt)).toBe('LIDO');
    expect(readStatusOf(new Date('2026-10-20T13:00:00Z'), updatedAt)).toBe('LIDO');
    expect(readStatusOf(new Date('2026-10-20T11:59:59Z'), updatedAt)).toBe('ATUALIZADO');
  });
});
