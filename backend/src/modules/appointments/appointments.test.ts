import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, timeOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OLD_CONSENT = 'aviso-antigo@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true });
  // Aceitou o aviso antes da agenda (DEC-045).
  await createConfirmedUser({ email: OLD_CONSENT, privacyVersion: '2026-10.3' });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
// Sessões a partir de amanhã: os testes não dependem da hora em que rodam.
const day = (offset: number) => addDays(today(), offset);
type Session = { date: string; time: string | null; status: string; reason: string | null; kind: string };
const sessionDates = (body: { sessions: Session[] }) => body.sessions.map((s) => s.date);

function seedExtra(userId: string, appointmentDate: string, time: string | null = '10:00') {
  return prisma.appointment.create({
    data: {
      userId,
      appointmentDate: dateOnlyToDate(appointmentDate),
      appointmentTime: time ? timeOnlyToDate(time) : null,
    },
  });
}

function seedSchedule(userId: string, startDate = day(1), frequency: 'SEMANAL' | 'QUINZENAL' = 'SEMANAL') {
  return prisma.appointmentSchedule.create({
    data: { userId, startDate: dateOnlyToDate(startDate), time: timeOnlyToDate('14:00'), frequency },
  });
}

const schedule = (startDate = day(1), frequency = 'SEMANAL') => ({ startDate, time: '14:00', frequency });

// Regras criadas em outro dia: mudar não é mais a correção do mesmo dia (DEC-048).
async function backdateSchedules(userId: string, days = 10) {
  await prisma.appointmentSchedule.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
  });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const { id } = await seedExtra(patientId, day(3));
    const calls = [
      request(app).get('/appointments'),
      request(app).get('/appointments/calendar.ics'),
      request(app).post('/appointments').send({ appointmentDate: day(3), appointmentTime: '10:00' }),
      request(app).patch(`/appointments/${id}`).send({ appointmentDate: day(4), appointmentTime: '10:00' }),
      request(app).delete(`/appointments/${id}`),
      request(app).put('/appointments/schedule').send(schedule()),
      request(app).post('/appointments/schedule/end'),
      request(app).post('/appointments/pause').send({ startDate: day(1) }),
      request(app).post('/appointments/pause/resume'),
      request(app).post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: 'Motivo fictício' }),
      request(app).post(`/appointments/sessions/${day(1)}/reschedule`).send({ date: day(2), time: '09:00', reason: 'x' }),
      request(app).delete(`/appointments/sessions/${day(1)}/change`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente, nada gravado', async () => {
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get('/appointments');
    const create = await agent.post('/appointments').send({ appointmentDate: day(3), appointmentTime: '10:00' });
    const setSchedule = await agent.put('/appointments/schedule').send(schedule());

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(create.status).toBe(403);
    expect(setSchedule.status).toBe(403);
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.appointmentSchedule.count()).toBe(0);
  });

  it('a lista traz só a agenda da própria paciente', async () => {
    await seedSchedule(otherPatientId, day(2));
    await seedExtra(otherPatientId, day(3));
    await seedExtra(patientId, day(4));
    const agent = await loginAgent();

    const res = await agent.get('/appointments');

    expect(res.status).toBe(200);
    expect(sessionDates(res.body)).toEqual([day(4)]);
    expect(res.body.schedule).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('userId');
  });

  it('avulsa de outra paciente: 403 em editar e excluir, sem alterar nada', async () => {
    const theirs = await seedExtra(otherPatientId, day(3));
    const agent = await loginAgent();

    const edit = await agent.patch(`/appointments/${theirs.id}`).send({ appointmentDate: day(5), appointmentTime: '10:00' });
    const remove = await agent.delete(`/appointments/${theirs.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.appointment.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('sessão da agenda de outra paciente: 404 para mim, e a agenda dela continua igual', async () => {
    await seedSchedule(otherPatientId, day(1));
    const agent = await loginAgent();

    const cancel = await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: 'Motivo fictício' });
    const pause = await agent.post('/appointments/pause').send({ startDate: day(1) });
    const end = await agent.post('/appointments/schedule/end');

    expect(cancel.status).toBe(404);
    expect(pause.status).toBe(409);
    expect(end.status).toBe(409);
    expect(await prisma.appointmentException.count()).toBe(0);
    expect(await prisma.therapyPause.count()).toBe(0);
    expect((await prisma.appointmentSchedule.findFirstOrThrow({ where: { userId: otherPatientId } })).endDate).toBeNull();
  });

  it('o userId vem da sessão: userId ou patientId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const extra = await agent
      .post('/appointments')
      .send({ appointmentDate: day(3), appointmentTime: '10:00', userId: otherPatientId });
    const rule = await agent.put('/appointments/schedule').send({ ...schedule(), patientId: otherPatientId });

    expect(extra.status).toBe(400);
    expect(rule.status).toBe(400);
    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.appointmentSchedule.count()).toBe(0);
  });
});

describe('aceite do aviso (DEC-045)', () => {
  it('sem a versão 2026-10.4: lê a agenda, mas não grava hora, motivo nem pausa', async () => {
    const agent = await loginAgent(OLD_CONSENT);

    expect((await agent.get('/appointments')).status).toBe(200);
    const rule = await agent.put('/appointments/schedule').send(schedule());
    const extra = await agent.post('/appointments').send({ appointmentDate: day(3), appointmentTime: '10:00' });

    for (const res of [rule, extra]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
    expect(await prisma.appointmentSchedule.count()).toBe(0);
  });
});

describe('agenda: agendar e mudar', () => {
  it('agenda semanal: calcula as sessões, a próxima e as próximas 6', async () => {
    const agent = await loginAgent();

    const res = await agent.put('/appointments/schedule').send(schedule(day(1)));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ATIVA');
    expect(res.body.schedule).toEqual({ startDate: day(1), time: '14:00', frequency: 'SEMANAL' });
    expect(res.body.next).toEqual(expect.objectContaining({ date: day(1), time: '14:00', kind: 'RECORRENTE' }));
    expect(res.body.upcoming.map((s: Session) => s.date)).toEqual([1, 8, 15, 22, 29, 36].map(day));
  });

  it('quinzenal: de 14 em 14 dias', async () => {
    const agent = await loginAgent();

    const res = await agent.put('/appointments/schedule').send(schedule(day(1), 'QUINZENAL'));

    expect(res.body.upcoming.slice(0, 3).map((s: Session) => s.date)).toEqual([1, 15, 29].map(day));
  });

  it('a primeira agenda pode começar no passado; uma mudança, não', async () => {
    const agent = await loginAgent();

    // Começa há 15 dias: nenhuma sessão cai hoje, e o teste não depende da hora em que roda.
    const first = await agent.put('/appointments/schedule').send(schedule(day(-15)));
    await backdateSchedules(patientId);
    const change = await agent.put('/appointments/schedule').send(schedule(day(-7)));

    expect(first.status).toBe(200);
    expect(first.body.last.date).toBe(day(-1));
    expect(first.body.next.date).toBe(day(6));
    expect(change.status).toBe(400);
    expect(change.body.error.code).toBe('START_IN_PAST');
  });

  it('mudar: a regra antiga termina na véspera, o passado fica e as mudanças depois somem', async () => {
    const agent = await loginAgent();
    await agent.put('/appointments/schedule').send(schedule(day(-14)));
    await agent.post(`/appointments/sessions/${day(14)}/cancel`).send({ reason: 'Motivo fictício' });
    await backdateSchedules(patientId);

    const res = await agent.put('/appointments/schedule').send({ startDate: day(2), time: '18:30', frequency: 'SEMANAL' });

    expect(res.status).toBe(200);
    expect(res.body.schedule).toEqual({ startDate: day(2), time: '18:30', frequency: 'SEMANAL' });
    const dates = sessionDates(res.body);
    expect(dates).toEqual(expect.arrayContaining([day(-14), day(-7), day(0), day(2), day(9), day(16)]));
    expect(dates).not.toContain(day(7));
    expect(await prisma.appointmentException.count()).toBe(0);
    const old = await prisma.appointmentSchedule.findFirstOrThrow({ where: { userId: patientId, endReason: 'MUDANCA' } });
    expect(old.endDate).toEqual(dateOnlyToDate(day(1)));
  });

  it('mudar no mesmo dia em que a agenda foi criada é correção: a regra errada some inteira', async () => {
    const agent = await loginAgent();
    // O engano: a primeira sessão hoje, à meia-noite (já passou).
    await agent.put('/appointments/schedule').send({ startDate: today(), time: '00:00', frequency: 'SEMANAL' });
    await agent.post(`/appointments/sessions/${day(7)}/cancel`).send({ reason: 'Motivo fictício' });

    const res = await agent.put('/appointments/schedule').send(schedule(day(3)));

    expect(res.status).toBe(200);
    expect(sessionDates(res.body)).not.toContain(today());
    expect(res.body.last).toBeNull();
    expect(await prisma.appointmentSchedule.count()).toBe(1);
    expect(await prisma.appointmentException.count()).toBe(0);
  });

  it('correção no mesmo dia: a regra antiga que tinha sido fechada hoje volta e é fechada de novo', async () => {
    await seedSchedule(patientId, day(-21));
    await backdateSchedules(patientId);
    const agent = await loginAgent();
    await agent.put('/appointments/schedule').send(schedule(day(2)));

    const res = await agent.put('/appointments/schedule').send(schedule(day(4)));

    expect(res.status).toBe(200);
    const rows = await prisma.appointmentSchedule.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ endDate: dateOnlyToDate(day(3)), endReason: 'MUDANCA' });
    expect(rows[1]).toMatchObject({ startDate: dateOnlyToDate(day(4)), endDate: null });
    // As sessões da regra antiga até a véspera da nova voltam (a de day(0), por exemplo).
    expect(sessionDates(res.body)).toEqual(expect.arrayContaining([day(-21), day(-14), day(-7), day(0), day(4)]));
  });

  it('consulta antiga, sem hora, num dia da agenda nova é absorvida por ela', async () => {
    await seedExtra(patientId, day(-11), null);
    await seedExtra(patientId, day(-10), null);
    const agent = await loginAgent();

    const res = await agent.put('/appointments/schedule').send(schedule(day(-18)));

    expect(res.status).toBe(200);
    const sessions = res.body.sessions as Session[];
    expect(sessions.find((s) => s.date === day(-11))).toEqual(expect.objectContaining({ kind: 'RECORRENTE', time: '14:00' }));
    // A que não cai num dia da agenda continua avulsa.
    expect(sessions.find((s) => s.date === day(-10))).toEqual(expect.objectContaining({ kind: 'AVULSA', time: null }));
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('a nova agenda não pode cair num dia que já tem consulta avulsa: 409', async () => {
    await seedExtra(patientId, day(8));
    const agent = await loginAgent();

    const res = await agent.put('/appointments/schedule').send(schedule(day(1)));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SCHEDULE_CONFLICT');
    expect(await prisma.appointmentSchedule.count()).toBe(0);
  });

  it.each([
    ['sem hora', { startDate: '2026-10-07', frequency: 'SEMANAL' }],
    ['hora inválida', { startDate: '2026-10-07', time: '25:00', frequency: 'SEMANAL' }],
    ['frequência inválida', { startDate: '2026-10-07', time: '14:00', frequency: 'MENSAL' }],
  ])('400: %s', async (_label, body) => {
    const agent = await loginAgent();

    const res = await agent.put('/appointments/schedule').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('sessões: desmarcar, remarcar e desfazer', () => {
  beforeEach(() => seedSchedule(patientId, day(1)));

  it('desmarcar com motivo: a sessão fica, riscada, e sai da "próxima"', async () => {
    const agent = await loginAgent();

    const res = await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: '  Feriado fictício  ' });

    expect(res.status).toBe(200);
    expect(res.body.upcoming[0]).toEqual(
      expect.objectContaining({ date: day(1), status: 'DESMARCADA', reason: 'Feriado fictício' }),
    );
    expect(res.body.next.date).toBe(day(8));
  });

  it('desmarcar: motivo obrigatório, dia sem sessão é 404 e a segunda vez é 409', async () => {
    const agent = await loginAgent();

    const empty = await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: '   ' });
    const noSession = await agent.post(`/appointments/sessions/${day(2)}/cancel`).send({ reason: 'Motivo fictício' });
    await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: 'Motivo fictício' });
    const twice = await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: 'Motivo fictício' });

    expect(empty.status).toBe(400);
    expect(noSession.status).toBe(404);
    expect(noSession.body.error.code).toBe('SESSION_NOT_FOUND');
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('SESSION_ALREADY_CHANGED');
  });

  it('remarcar com motivo: a sessão vai para o dia novo', async () => {
    const agent = await loginAgent();

    const res = await agent
      .post(`/appointments/sessions/${day(8)}/reschedule`)
      .send({ date: day(10), time: '09:30', reason: 'Viagem fictícia' });

    expect(res.status).toBe(200);
    const dates = sessionDates(res.body);
    expect(dates).toContain(day(10));
    expect(dates).not.toContain(day(8));
    expect(res.body.sessions.find((s: Session) => s.date === day(10))).toEqual(
      expect.objectContaining({ time: '09:30', rescheduled: true, originalDate: day(8), reason: 'Viagem fictícia' }),
    );
  });

  it('remarcar: só a hora, no mesmo dia, é permitido', async () => {
    const agent = await loginAgent();

    const res = await agent
      .post(`/appointments/sessions/${day(8)}/reschedule`)
      .send({ date: day(8), time: '16:00', reason: 'Motivo fictício' });

    expect(res.status).toBe(200);
    expect(res.body.sessions.find((s: Session) => s.date === day(8)).time).toBe('16:00');
  });

  it('remarcar para um dia com outra sessão: 409; para o passado: 400', async () => {
    const agent = await loginAgent();

    const busy = await agent
      .post(`/appointments/sessions/${day(8)}/reschedule`)
      .send({ date: day(15), time: '09:30', reason: 'Motivo fictício' });
    const past = await agent
      .post(`/appointments/sessions/${day(8)}/reschedule`)
      .send({ date: day(-1), time: '09:30', reason: 'Motivo fictício' });

    expect(busy.status).toBe(409);
    expect(busy.body.error.code).toBe('APPOINTMENT_EXISTS');
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('RESCHEDULE_IN_PAST');
  });

  it('desfazer: a sessão volta ao dia e à hora da regra', async () => {
    const agent = await loginAgent();
    await agent
      .post(`/appointments/sessions/${day(8)}/reschedule`)
      .send({ date: day(10), time: '09:30', reason: 'Motivo fictício' });

    const res = await agent.delete(`/appointments/sessions/${day(8)}/change`);
    const again = await agent.delete(`/appointments/sessions/${day(8)}/change`);

    expect(res.status).toBe(200);
    expect(sessionDates(res.body)).toContain(day(8));
    expect(sessionDates(res.body)).not.toContain(day(10));
    expect(again.status).toBe(404);
    expect(again.body.error.code).toBe('SESSION_NOT_CHANGED');
  });
});

describe('sessão passada', () => {
  it('dá para desmarcar (registrar a falta), mas não remarcar', async () => {
    await seedSchedule(patientId, day(-7));
    const agent = await loginAgent();

    const cancel = await agent.post(`/appointments/sessions/${day(-7)}/cancel`).send({ reason: 'Falta fictícia' });
    await agent.delete(`/appointments/sessions/${day(-7)}/change`);
    const reschedule = await agent
      .post(`/appointments/sessions/${day(-7)}/reschedule`)
      .send({ date: day(3), time: '09:30', reason: 'Motivo fictício' });

    expect(cancel.status).toBe(200);
    expect(reschedule.status).toBe(409);
    expect(reschedule.body.error.code).toBe('SESSION_STARTED');
  });
});

describe('pausa', () => {
  it('sem agenda em vigor: 409', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/appointments/pause').send({ startDate: day(1) });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SCHEDULE');
  });

  it('com data de volta: some o que cai na pausa e a agenda volta sozinha', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();

    const res = await agent.post('/appointments/pause').send({ startDate: day(5), returnDate: day(20) });

    expect(res.status).toBe(200);
    expect(res.body.pause).toEqual({ startDate: day(5), returnDate: day(20) });
    expect(res.body.upcoming.slice(0, 3).map((s: Session) => s.date)).toEqual([1, 22, 29].map(day));
    expect(res.body.status).toBe('ATIVA');
  });

  it('sem data de volta, começando hoje: pausada até retomar; retomar agora devolve as sessões', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();

    const paused = await agent.post('/appointments/pause').send({ startDate: today() });
    const second = await agent.post('/appointments/pause').send({ startDate: day(3) });
    const resumed = await agent.post('/appointments/pause/resume');
    const nothing = await agent.post('/appointments/pause/resume');

    expect(paused.body.status).toBe('PAUSADA');
    expect(paused.body.next).toBeNull();
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('PAUSE_EXISTS');
    expect(resumed.body.status).toBe('ATIVA');
    expect(resumed.body.pause).toBeNull();
    expect(resumed.body.next.date).toBe(day(1));
    expect(nothing.status).toBe(409);
    expect(nothing.body.error.code).toBe('NO_PAUSE');
  });

  it('400: começa no passado ou volta antes de começar', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();

    const past = await agent.post('/appointments/pause').send({ startDate: day(-1) });
    const backwards = await agent.post('/appointments/pause').send({ startDate: day(5), returnDate: day(5) });

    expect(past.body.error.code).toBe('PAUSE_START_IN_PAST');
    expect(backwards.body.error.code).toBe('PAUSE_RETURN_BEFORE_START');
  });
});

describe('encerrar a terapia', () => {
  it('as sessões futuras somem, inclusive as avulsas; o histórico fica', async () => {
    await seedSchedule(patientId, day(-14));
    await seedExtra(patientId, day(-3));
    await seedExtra(patientId, day(4));
    const agent = await loginAgent();

    const res = await agent.post('/appointments/schedule/end');
    const again = await agent.post('/appointments/schedule/end');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ENCERRADA');
    expect(res.body.schedule).toBeNull();
    expect(res.body.next).toBeNull();
    expect(res.body.upcoming).toEqual([]);
    expect(sessionDates(res.body)).toEqual(expect.arrayContaining([day(-14), day(-7), day(-3)]));
    expect(sessionDates(res.body).every((d: string) => d <= today())).toBe(true);
    expect(again.status).toBe(409);
  });

  it('dá para agendar de novo depois de encerrar', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();
    await agent.post('/appointments/schedule/end');

    const res = await agent.put('/appointments/schedule').send(schedule(day(3)));

    expect(res.body.status).toBe('ATIVA');
  });
});

describe('consultas avulsas', () => {
  it('cria com hora; sem hora é 400', async () => {
    const agent = await loginAgent();

    const ok = await agent.post('/appointments').send({ appointmentDate: day(3), appointmentTime: '18:00' });
    const noTime = await agent.post('/appointments').send({ appointmentDate: day(4) });

    expect(ok.status).toBe(201);
    expect(ok.body.appointment).toEqual(expect.objectContaining({ appointmentDate: day(3), appointmentTime: '18:00' }));
    expect(noTime.status).toBe(400);
  });

  it('não pode cair num dia com sessão da agenda: 409', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();

    const res = await agent.post('/appointments').send({ appointmentDate: day(8), appointmentTime: '18:00' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPOINTMENT_EXISTS');
  });

  it('pode cair no dia de uma sessão desmarcada', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();
    await agent.post(`/appointments/sessions/${day(8)}/cancel`).send({ reason: 'Motivo fictício' });

    const res = await agent.post('/appointments').send({ appointmentDate: day(8), appointmentTime: '18:00' });

    expect(res.status).toBe(201);
  });

  it('avulsa antiga, sem hora, aparece no histórico com time null', async () => {
    await seedExtra(patientId, day(-30), null);
    const agent = await loginAgent();

    const res = await agent.get('/appointments');

    expect(res.body.sessions).toEqual([expect.objectContaining({ date: day(-30), time: null, kind: 'AVULSA' })]);
    expect(res.body.last.date).toBe(day(-30));
    expect(res.body.status).toBe('SEM_AGENDA');
  });

  it('muda e exclui', async () => {
    const extra = await seedExtra(patientId, day(3));
    const agent = await loginAgent();

    const moved = await agent.patch(`/appointments/${extra.id}`).send({ appointmentDate: day(4), appointmentTime: '08:00' });
    const removed = await agent.delete(`/appointments/${extra.id}`);
    const missing = await agent.delete(`/appointments/${extra.id}`);

    expect(moved.body.appointment).toEqual(expect.objectContaining({ appointmentDate: day(4), appointmentTime: '08:00' }));
    expect(removed.status).toBe(204);
    expect(missing.status).toBe(404);
  });
});

describe('GET /appointments', () => {
  it('período: from e to juntos, até 400 dias', async () => {
    const agent = await loginAgent();

    const ok = await agent.get('/appointments').query({ from: day(0), to: day(30) });
    const half = await agent.get('/appointments').query({ from: day(0) });
    const tooLong = await agent.get('/appointments').query({ from: day(0), to: day(400) });

    expect(ok.status).toBe(200);
    expect(ok.body).toEqual(expect.objectContaining({ from: day(0), to: day(30) }));
    expect(half.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });
});

describe('GET /appointments/calendar.ics', () => {
  it('arquivo de agenda com as próximas sessões, texto neutro', async () => {
    await seedSchedule(patientId, day(1));
    const agent = await loginAgent();

    const res = await agent.get('/appointments/calendar.ics');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.headers['content-disposition']).toContain('faisca-consultas.ics');
    expect(res.text).toContain(`DTSTART;TZID=America/Sao_Paulo:${day(1).replaceAll('-', '')}T140000`);
    expect(res.text).toContain('SUMMARY:Consulta');
  });
});

describe('excluir a conta (LGPD)', () => {
  it('apaga agenda, mudanças, pausas e avulsas', async () => {
    await seedSchedule(patientId, day(1));
    await seedExtra(patientId, day(3));
    const agent = await loginAgent();
    await agent.post(`/appointments/sessions/${day(1)}/cancel`).send({ reason: 'Motivo fictício' });
    await agent.post('/appointments/pause').send({ startDate: day(20) });

    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.appointment.count()).toBe(0);
    expect(await prisma.appointmentSchedule.count()).toBe(0);
    expect(await prisma.appointmentException.count()).toBe(0);
    expect(await prisma.therapyPause.count()).toBe(0);
  });
});
