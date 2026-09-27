import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();

function seedAppointment(userId: string, appointmentDate = today()) {
  return prisma.appointment.create({ data: { userId, appointmentDate: dateOnlyToDate(appointmentDate) } });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const { id } = await seedAppointment(patientId);
    const calls = [
      request(app).get('/appointments'),
      request(app).post('/appointments').send({ appointmentDate: today() }),
      request(app).patch(`/appointments/${id}`).send({ appointmentDate: today() }),
      request(app).delete(`/appointments/${id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente', async () => {
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get('/appointments');
    const create = await agent.post('/appointments').send({ appointmentDate: today() });

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(create.status).toBe(403);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it('a lista traz só as consultas da própria paciente', async () => {
    await seedAppointment(patientId, '2026-09-01');
    await seedAppointment(otherPatientId, '2026-09-02');
    const agent = await loginAgent();

    const res = await agent.get('/appointments');

    expect(res.status).toBe(200);
    expect(res.body.appointments.map((a: { appointmentDate: string }) => a.appointmentDate)).toEqual([
      '2026-09-01',
    ]);
    expect(res.body.appointments[0]).not.toHaveProperty('userId');
  });

  it('consulta de outra paciente: 403 em editar e excluir, sem alterar nada', async () => {
    const theirs = await seedAppointment(otherPatientId, '2026-09-02');
    const agent = await loginAgent();

    const edit = await agent.patch(`/appointments/${theirs.id}`).send({ appointmentDate: '2026-09-03' });
    const remove = await agent.delete(`/appointments/${theirs.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('o userId vem da sessão: um userId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/appointments').send({ appointmentDate: today(), userId: otherPatientId });

    expect(res.status).toBe(400);
    expect(await prisma.appointment.count()).toBe(0);
  });
});

describe('GET /appointments', () => {
  it('ordena da mais recente para a mais antiga e calcula última e próxima', async () => {
    const past = addDays(today(), -7);
    const future = addDays(today(), 7);
    const farFuture = addDays(today(), 14);
    for (const date of [past, farFuture, today(), future]) await seedAppointment(patientId, date);
    const agent = await loginAgent();

    const res = await agent.get('/appointments');

    expect(res.status).toBe(200);
    expect(res.body.appointments.map((a: { appointmentDate: string }) => a.appointmentDate)).toEqual([
      farFuture,
      future,
      today(),
      past,
    ]);
    // Hoje conta como última (SPEC); a próxima começa amanhã.
    expect(res.body.last.appointmentDate).toBe(today());
    expect(res.body.next.appointmentDate).toBe(future);
  });

  it('sem consultas: lista vazia e última/próxima null', async () => {
    const agent = await loginAgent();

    const res = await agent.get('/appointments');

    expect(res.body).toEqual({ appointments: [], last: null, next: null });
  });
});

describe('POST /appointments', () => {
  it('cria consulta passada ou futura', async () => {
    const agent = await loginAgent();

    const past = await agent.post('/appointments').send({ appointmentDate: '2026-01-15' });
    const future = await agent.post('/appointments').send({ appointmentDate: addDays(today(), 30) });

    expect(past.status).toBe(201);
    expect(past.body.appointment.appointmentDate).toBe('2026-01-15');
    expect(future.status).toBe(201);
  });

  it('uma consulta por dia: a segunda no mesmo dia é 409', async () => {
    await seedAppointment(patientId, '2026-10-04');
    const agent = await loginAgent();

    const res = await agent.post('/appointments').send({ appointmentDate: '2026-10-04' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_EXISTS');
  });

  it('outra paciente pode ter consulta no mesmo dia', async () => {
    await seedAppointment(otherPatientId, '2026-10-04');
    const agent = await loginAgent();

    const res = await agent.post('/appointments').send({ appointmentDate: '2026-10-04' });

    expect(res.status).toBe(201);
  });

  it.each([
    ['sem data', {}],
    ['data inválida', { appointmentDate: '2026-02-30' }],
    ['formato errado', { appointmentDate: '04/10/2026' }],
  ])('400: %s', async (_label, body) => {
    const agent = await loginAgent();

    const res = await agent.post('/appointments').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH e DELETE /appointments/:id', () => {
  it('muda a data', async () => {
    const appointment = await seedAppointment(patientId, '2026-10-04');
    const agent = await loginAgent();

    const res = await agent.patch(`/appointments/${appointment.id}`).send({ appointmentDate: '2026-10-05' });

    expect(res.status).toBe(200);
    expect(res.body.appointment.appointmentDate).toBe('2026-10-05');
  });

  it('mudar para um dia que já tem consulta: 409', async () => {
    await seedAppointment(patientId, '2026-10-05');
    const appointment = await seedAppointment(patientId, '2026-10-04');
    const agent = await loginAgent();

    const res = await agent.patch(`/appointments/${appointment.id}`).send({ appointmentDate: '2026-10-05' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_EXISTS');
  });

  it('exclui', async () => {
    const appointment = await seedAppointment(patientId);
    const agent = await loginAgent();

    const res = await agent.delete(`/appointments/${appointment.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.appointment.count()).toBe(0);
  });

  it('id que não existe: 404; id malformado: 400', async () => {
    const agent = await loginAgent();

    const missing = await agent.delete('/appointments/00000000-0000-4000-8000-000000000000');
    const malformed = await agent.patch('/appointments/nao-e-uuid').send({ appointmentDate: today() });

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it('excluir a conta apaga as consultas (LGPD)', async () => {
    await seedAppointment(patientId);

    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.appointment.count({ where: { userId: patientId } })).toBe(0);
  });
});
