import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { highlightWindow } from './therapist.service.js';

// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  await createConfirmedUser({ email: OTHER_THERAPIST, patient: false, therapist: true });
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const week = () => ({ from: addDays(today(), -6), to: today() });

function seedActivity(userId: string, name: string, activityDate = today()) {
  return prisma.activity.create({
    data: {
      userId,
      name,
      activityDate: dateOnlyToDate(activityDate),
      status: 'CONCLUIDA',
      wantBefore: 3,
      pleasure: 7,
      achievement: 8,
      observation: 'Observação fictícia',
    },
  });
}

function seedAppointment(userId: string, appointmentDate: string) {
  return prisma.appointment.create({ data: { userId, appointmentDate: dateOnlyToDate(appointmentDate) } });
}

const base = (id = patientId) => `/therapist/patients/${id}`;

describe('autorização (regra 1)', () => {
  it('terapeuta com vínculo ativo lê resumo, atividades e consultas', async () => {
    await seedActivity(patientId, 'Caminhada fictícia');
    await seedAppointment(patientId, addDays(today(), -3));
    const agent = await loginAgent(THERAPIST);

    const summary = await agent.get(base());
    const activities = await agent.get(`${base()}/activities`).query(week());
    const appointments = await agent.get(`${base()}/appointments`);

    expect(summary.status).toBe(200);
    expect(summary.body.patient).toEqual(expect.objectContaining({ id: patientId, name: 'Paula Fictícia', email: PATIENT }));
    expect(activities.status).toBe(200);
    // Nada é privado (SPEC): notas, observação e as duas datas.
    expect(activities.body.activities).toEqual([
      expect.objectContaining({
        name: 'Caminhada fictícia',
        pleasure: 7,
        achievement: 8,
        observation: 'Observação fictícia',
        activityDate: today(),
        createdAt: expect.any(String),
      }),
    ]);
    expect(activities.body.activities[0]).not.toHaveProperty('userId');
    expect(appointments.status).toBe(200);
    expect(appointments.body.appointments).toHaveLength(1);
  });

  it('qualquer método de escrita é 403 antes de tudo: sem sessão, com vínculo e em caminho inexistente', async () => {
    const { id: activityId } = await seedActivity(patientId, 'Caminhada fictícia');
    const agent = await loginAgent(THERAPIST);

    const calls = [
      request(app).post(`${base()}/activities`).send({ name: 'x' }),
      agent.post(`${base()}/activities`).send({ name: 'Invasão', activityDate: today(), status: 'PLANEJADA' }),
      agent.patch(`${base()}/activities/${activityId}`).send({ name: 'Mudado' }),
      agent.put(base()).send({}),
      agent.delete(`${base()}/activities/${activityId}`),
      agent.delete(`${base()}/appointments`),
      agent.post(`${base()}/qualquer/coisa`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    const activity = await prisma.activity.findUniqueOrThrow({ where: { id: activityId } });
    expect(activity.name).toBe('Caminhada fictícia');
    expect(await prisma.activity.count()).toBe(1);
  });

  it('sem sessão, a leitura é 401', async () => {
    expect((await request(app).get(base())).status).toBe(401);
  });

  it('conta sem perfil de terapeuta: 403', async () => {
    // O próprio paciente também não entra pela porta da terapeuta.
    const agent = await loginAgent(PATIENT);

    const res = await agent.get(base());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('THERAPIST_PROFILE_REQUIRED');
  });

  it('paciente sem vínculo com esta terapeuta: 403 em todas as leituras', async () => {
    await seedActivity(otherPatientId, 'Registro da outra');
    const agent = await loginAgent(THERAPIST);

    for (const path of [base(otherPatientId), `${base(otherPatientId)}/activities`, `${base(otherPatientId)}/appointments`]) {
      const res = await agent.get(path).query(week());
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(JSON.stringify(res.body)).not.toContain('Registro da outra');
    }
  });

  it('paciente de outra terapeuta: 403', async () => {
    const res = await (await loginAgent(OTHER_THERAPIST)).get(base());

    expect(res.status).toBe(403);
  });

  it('vínculo revogado: o acesso cai na hora', async () => {
    const agent = await loginAgent(THERAPIST);
    expect((await agent.get(base())).status).toBe(200);

    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });

    expect((await agent.get(base())).status).toBe(403);
    expect((await agent.get(`${base()}/activities`).query(week())).status).toBe(403);
  });

  it('id inválido ou inexistente: o mesmo 403, sem dizer se a pessoa existe', async () => {
    const agent = await loginAgent(THERAPIST);

    const invalid = await agent.get(base('nao-e-uuid'));
    const unknown = await agent.get(base('00000000-0000-4000-8000-000000000999'));

    expect(invalid.status).toBe(403);
    expect(unknown.status).toBe(403);
    expect(invalid.body).toEqual(unknown.body);
  });

  it('a terapeuta vê só as atividades do paciente vinculado', async () => {
    await seedActivity(patientId, 'Do paciente');
    await seedActivity(otherPatientId, 'De outra pessoa');

    const res = await (await loginAgent(THERAPIST)).get(`${base()}/activities`).query(week());

    expect(res.body.activities.map((a: { name: string }) => a.name)).toEqual(['Do paciente']);
  });
});

describe('atividades da terapeuta', () => {
  it('aceita até 92 dias e recusa 93', async () => {
    const agent = await loginAgent(THERAPIST);

    const ok = await agent.get(`${base()}/activities`).query({ from: addDays(today(), -91), to: today() });
    const tooLong = await agent.get(`${base()}/activities`).query({ from: addDays(today(), -92), to: today() });

    expect(ok.status).toBe(200);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('o paciente continua com o limite de 42 dias', async () => {
    const res = await (await loginAgent(PATIENT)).get('/activities').query({ from: addDays(today(), -60), to: today() });

    expect(res.status).toBe(400);
  });
});

describe('resumo e destaque', () => {
  it('com próxima consulta: destaca os 7 dias antes dela', async () => {
    const next = addDays(today(), 3);
    await seedAppointment(patientId, addDays(today(), -10));
    await seedAppointment(patientId, next);

    const res = await (await loginAgent(THERAPIST)).get(base());

    expect(res.body.today).toBe(today());
    expect(res.body.lastAppointment.appointmentDate).toBe(addDays(today(), -10));
    expect(res.body.nextAppointment.appointmentDate).toBe(next);
    expect(res.body.highlight).toEqual({ from: addDays(next, -7), to: addDays(next, -1), reason: 'NEXT_APPOINTMENT' });
  });

  it('sem próxima consulta: destaca os últimos 7 dias até hoje', async () => {
    const res = await (await loginAgent(THERAPIST)).get(base());

    expect(res.body.nextAppointment).toBeNull();
    expect(res.body.highlight).toEqual({ from: addDays(today(), -6), to: today(), reason: 'LAST_7_DAYS' });
  });
});

describe('highlightWindow', () => {
  it('consulta amanhã: a semana termina hoje', () => {
    expect(highlightWindow('2026-10-01', '2026-09-30')).toEqual({
      from: '2026-09-24',
      to: '2026-09-30',
      reason: 'NEXT_APPOINTMENT',
    });
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(highlightWindow('2027-01-03', '2026-12-20')).toMatchObject({ from: '2026-12-27', to: '2027-01-02' });
  });

  it('sem próxima consulta: hoje e os 6 dias antes', () => {
    expect(highlightWindow(null, '2026-03-02')).toEqual({ from: '2026-02-24', to: '2026-03-02', reason: 'LAST_7_DAYS' });
  });
});

describe('Registro de Pensamentos da terapeuta (DEC-039)', () => {
  function seedThoughtRecord(userId: string, situation: string) {
    return prisma.thoughtRecord.create({
      data: {
        userId,
        situationDate: dateOnlyToDate(today()),
        situation,
        automaticThought: 'Pensamento fictício',
        beliefLevel: 6,
        behavior: 'Comportamento fictício',
        consequence: 'Consequência fictícia',
        emotions: { create: [{ emotion: 'OUTRA', intensity: 4, otherLabel: 'Inquietação' }] },
      },
    });
  }

  const path = (id = patientId) => `${base(id)}/thought-records`;

  it('com vínculo ativo: lê tudo, só do paciente vinculado, sem userId', async () => {
    await seedThoughtRecord(patientId, 'Situação do paciente');
    await seedThoughtRecord(otherPatientId, 'Situação de outra pessoa');

    const res = await (await loginAgent(THERAPIST)).get(path()).query(week());

    expect(res.status).toBe(200);
    // Nada é privado (SPEC): todos os campos e as duas datas.
    expect(res.body.thoughtRecords).toEqual([
      expect.objectContaining({
        situation: 'Situação do paciente',
        automaticThought: 'Pensamento fictício',
        beliefLevel: 6,
        emotions: [{ emotion: 'OUTRA', intensity: 4, otherLabel: 'Inquietação' }],
        behavior: 'Comportamento fictício',
        consequence: 'Consequência fictícia',
        situationDate: today(),
        createdAt: expect.any(String),
      }),
    ]);
    expect(res.body.thoughtRecords[0]).not.toHaveProperty('userId');
  });

  it('escrita é 403 mesmo com vínculo ativo, e nada muda', async () => {
    const record = await seedThoughtRecord(patientId, 'Situação do paciente');
    const agent = await loginAgent(THERAPIST);

    const calls = [
      agent.post(path()).send({ situation: 'Invasão' }),
      agent.patch(`${path()}/${record.id}`).send({ beliefLevel: 0 }),
      agent.delete(`${path()}/${record.id}`),
      // Nem pela rota do paciente: a terapeuta não tem perfil de paciente.
      agent.patch(`/thought-records/${record.id}`).send({ beliefLevel: 0 }),
      agent.delete(`/thought-records/${record.id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(403);
    expect(await prisma.thoughtRecord.findUniqueOrThrow({ where: { id: record.id } })).toEqual(record);
  });

  it('sem sessão: GET 401 e escrita 403', async () => {
    expect((await request(app).get(path()).query(week())).status).toBe(401);
    expect((await request(app).post(path()).send({})).status).toBe(403);
  });

  it('sem vínculo, vínculo revogado, outra terapeuta ou id inválido: 403', async () => {
    await seedThoughtRecord(otherPatientId, 'Situação de outra pessoa');
    const agent = await loginAgent(THERAPIST);

    const noLink = await agent.get(path(otherPatientId)).query(week());
    const invalid = await agent.get(path('nao-e-uuid')).query(week());
    const otherTherapist = await (await loginAgent(OTHER_THERAPIST)).get(path()).query(week());
    await prisma.therapistLink.updateMany({ data: { revokedAt: new Date() } });
    const revoked = await agent.get(path()).query(week());

    for (const res of [noLink, invalid, otherTherapist, revoked]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(JSON.stringify(res.body)).not.toContain('Situação de outra pessoa');
    }
  });

  it('conta sem perfil de terapeuta: 403', async () => {
    const res = await (await loginAgent(PATIENT)).get(path()).query(week());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('THERAPIST_PROFILE_REQUIRED');
  });

  it('terapeuta sem o aceite da versão atual do aviso: 403, e o resto da visão funciona', async () => {
    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-10' } });
    const agent = await loginAgent(THERAPIST);

    const records = await agent.get(path()).query(week());

    expect(records.status).toBe(403);
    expect(records.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect((await agent.get(`${base()}/activities`).query(week())).status).toBe(200);
  });

  it('aceita até 92 dias e recusa 93', async () => {
    const agent = await loginAgent(THERAPIST);

    expect((await agent.get(path()).query({ from: addDays(today(), -91), to: today() })).status).toBe(200);
    expect((await agent.get(path()).query({ from: addDays(today(), -92), to: today() })).status).toBe(400);
  });
});
