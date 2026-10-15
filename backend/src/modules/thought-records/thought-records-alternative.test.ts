import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, timeOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { scheduledSessionsFrom, type AgendaData } from '../appointments/sessions.js';
import { deadlineFor, deadlineInstant, effectiveDeadline, isBeforeDeadline } from './thought-records.service.js';

// Explicação alternativa e "como me sinto agora" no RPD (SPEC, "Registro de Pensamentos"; DEC-054).
// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OLD_PRIVACY = 'antiga@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  const therapistId = (await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true })).id;
  await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });
  await createConfirmedUser({ email: OLD_PRIVACY, privacyVersion: '2026-10' });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

// Registro direto no banco, com duas emoções. createdAt no passado = já passou o dia do registro.
// alternativeDeadlineAt = prazo congelado na criação (null = registro de antes do prazo).
function seedRecord(userId = patientId, createdAt = daysAgo(3), alternativeDeadlineAt: Date | null = null) {
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
      alternativeDeadlineAt,
      emotions: {
        create: [
          { emotion: 'ANSIEDADE', intensity: 8 },
          { emotion: 'MEDO', intensity: 5 },
        ],
      },
    },
  });
}

// Consulta avulsa, com hora (DEC-045).
function seedAppointment(date: string, time = '10:00', userId = patientId) {
  return prisma.appointment.create({
    data: { userId, appointmentDate: dateOnlyToDate(date), appointmentTime: timeOnlyToDate(time) },
  });
}

const alternative = (overrides: Record<string, unknown> = {}) => ({
  alternativeExplanation: 'Explicação alternativa fictícia',
  ...overrides,
});

const bothEmotionsAfter = [
  { emotion: 'ANSIEDADE', intensityAfter: 4 },
  { emotion: 'MEDO', intensityAfter: 2 },
];

function newRecordBody(overrides: Record<string, unknown> = {}) {
  return {
    situationDate: today(),
    situation: 'Situação fictícia',
    automaticThought: 'Pensamento fictício',
    beliefLevel: 7,
    emotions: [
      { emotion: 'ANSIEDADE', intensity: 8 },
      { emotion: 'MEDO', intensity: 5 },
    ],
    behavior: 'Comportamento fictício',
    consequence: 'Consequência fictícia',
    ...overrides,
  };
}

describe('autorização da rota nova (regra 1)', () => {
  it('sem sessão: 401', async () => {
    const { id } = await seedRecord();
    const res = await request(app).post(`/thought-records/${id}/alternative`).send(alternative());
    expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));
    const res = await (await loginAgent(THERAPIST)).post(`/thought-records/${id}/alternative`).send(alternative());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect((await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } })).alternativeExplanation).toBeNull();
  });

  it('a terapeuta vinculada só lê: POST no contexto de terapeuta é 403', async () => {
    const { id } = await seedRecord();
    const res = await (await loginAgent(THERAPIST))
      .post(`/therapist/patients/${patientId}/thought-records/${id}/alternative`)
      .send(alternative());

    expect(res.status).toBe(403);
    expect((await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } })).alternativeExplanation).toBeNull();
  });

  it('registro de outra paciente: 403, nada gravado; inexistente: 404', async () => {
    const { id } = await seedRecord(otherPatientId);
    await seedAppointment(addDays(today(), 1), '10:00', otherPatientId);
    const agent = await loginAgent();

    const other = await agent.post(`/thought-records/${id}/alternative`).send(alternative());
    const missing = await agent
      .post('/thought-records/00000000-0000-4000-8000-000000000000/alternative')
      .send(alternative());

    expect(other.status).toBe(403);
    expect(missing.status).toBe(404);
    expect((await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } })).alternativeExplanation).toBeNull();
  });

  it('sem o aceite do aviso que cita o RPD: 403', async () => {
    const res = await (await loginAgent(OLD_PRIVACY))
      .post('/thought-records/00000000-0000-4000-8000-000000000000/alternative')
      .send(alternative());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });
});

describe('adicionar depois do dia (DEC-054)', () => {
  it('antes da próxima consulta: grava a alternativa, a data e a reavaliação de todas as emoções', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent())
      .post(`/thought-records/${id}/alternative`)
      .send(alternative({ emotionsAfter: bothEmotionsAfter }));

    expect(res.status).toBe(200);
    const record = res.body.thoughtRecord;
    expect(record.alternativeExplanation).toBe('Explicação alternativa fictícia');
    expect(Date.now() - new Date(record.alternativeAddedAt).getTime()).toBeLessThan(60_000);
    expect(record.emotions).toEqual([
      { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 4, otherLabel: null },
      { emotion: 'MEDO', intensity: 5, intensityAfter: 2, otherLabel: null },
    ]);
    expect(record.canAddAlternative).toBe(false);
    // O resto do registro continua travado.
    expect(record.editable).toBe(false);
  });

  it('a reavaliação é opcional', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent()).post(`/thought-records/${id}/alternative`).send(alternative());

    expect(res.status).toBe(200);
    expect(res.body.thoughtRecord.emotions.map((e: { intensityAfter: number | null }) => e.intensityAfter)).toEqual([
      null,
      null,
    ]);
  });

  it('uma vez só: a segunda é 409 e não muda nada', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));
    const agent = await loginAgent();

    expect((await agent.post(`/thought-records/${id}/alternative`).send(alternative())).status).toBe(200);
    const again = await agent
      .post(`/thought-records/${id}/alternative`)
      .send(alternative({ alternativeExplanation: 'Outra versão fictícia' }));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALTERNATIVE_ALREADY_SET');
    const stored = await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } });
    expect(stored.alternativeExplanation).toBe('Explicação alternativa fictícia');
  });

  it('dois envios ao mesmo tempo gravam uma vez só', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));
    const agent = await loginAgent();

    const results = await Promise.all([
      agent.post(`/thought-records/${id}/alternative`).send(alternative({ alternativeExplanation: 'Versão A' })),
      agent.post(`/thought-records/${id}/alternative`).send(alternative({ alternativeExplanation: 'Versão B' })),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('sem consulta agendada: 409 NO_NEXT_APPOINTMENT', async () => {
    const { id } = await seedRecord();

    const res = await (await loginAgent()).post(`/thought-records/${id}/alternative`).send(alternative());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_NEXT_APPOINTMENT');
  });

  it('a consulta seguinte ao registro já começou: 409, mesmo com outra consulta marcada depois', async () => {
    const { id } = await seedRecord(patientId, daysAgo(3));
    await seedAppointment(addDays(today(), -2));
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent()).post(`/thought-records/${id}/alternative`).send(alternative());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALTERNATIVE_DEADLINE_PASSED');
  });

  it('a reavaliação precisa cobrir todas as emoções do registro, uma vez cada', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));
    const agent = await loginAgent();

    const partial = await agent
      .post(`/thought-records/${id}/alternative`)
      .send(alternative({ emotionsAfter: [{ emotion: 'ANSIEDADE', intensityAfter: 3 }] }));
    const foreign = await agent.post(`/thought-records/${id}/alternative`).send(
      alternative({
        emotionsAfter: [
          { emotion: 'ANSIEDADE', intensityAfter: 3 },
          { emotion: 'RAIVA', intensityAfter: 2 },
        ],
      }),
    );

    expect(partial.status).toBe(400);
    expect(partial.body.error.code).toBe('EMOTIONS_MISMATCH');
    expect(foreign.status).toBe(400);
    expect((await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } })).alternativeExplanation).toBeNull();
  });

  it('valida o texto e as notas', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));
    const agent = await loginAgent();
    const invalid = [
      {},
      alternative({ alternativeExplanation: '   ' }),
      alternative({ alternativeExplanation: 'x'.repeat(5001) }),
      alternative({ emotionsAfter: [{ emotion: 'ANSIEDADE', intensityAfter: 11 }, { emotion: 'MEDO', intensityAfter: 1 }] }),
      alternative({ extra: true }),
    ];
    for (const payload of invalid) {
      const res = await agent.post(`/thought-records/${id}/alternative`).send(payload);
      expect(res.status, JSON.stringify(payload).slice(0, 80)).toBe(400);
    }
    expect((await agent.post(`/thought-records/${id}/alternative`).send(alternative({ alternativeExplanation: 'x'.repeat(5000) }))).status).toBe(200);
  });
});

describe('prazo congelado no registro (DEC-054)', () => {
  it('ao criar, guarda a hora da próxima consulta daquele momento', async () => {
    await seedAppointment(addDays(today(), 1), '10:00');

    const res = await (await loginAgent()).post('/thought-records').send(newRecordBody());

    const stored = await prisma.thoughtRecord.findUniqueOrThrow({ where: { id: res.body.thoughtRecord.id } });
    expect(stored.alternativeDeadlineAt).toEqual(deadlineInstant({ date: addDays(today(), 1), time: '10:00' }));
  });

  it('desmarcar ou apagar a consulta que já passou não reabre o prazo', async () => {
    // A consulta de dois dias atrás fechava o prazo; na agenda de agora, só sobrou a de amanhã.
    const frozen = deadlineInstant({ date: addDays(today(), -2), time: '10:00' });
    const { id } = await seedRecord(patientId, daysAgo(3), frozen);
    await seedAppointment(addDays(today(), 1));
    const agent = await loginAgent();

    const res = await agent.post(`/thought-records/${id}/alternative`).send(alternative());
    const list = await agent.get('/thought-records').query({ from: addDays(today(), -7), to: today() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALTERNATIVE_DEADLINE_PASSED');
    expect(list.body.thoughtRecords[0]).toMatchObject({
      alternativeDeadline: { date: addDays(today(), -2), time: '10:00' },
      canAddAlternative: false,
    });
  });

  it('a consulta antecipada encurta o prazo', async () => {
    const frozen = deadlineInstant({ date: addDays(today(), 5), time: '10:00' });
    await seedRecord(patientId, daysAgo(1), frozen);
    await seedAppointment(addDays(today(), 1), '09:00');

    const res = await (await loginAgent()).get('/thought-records').query({ from: addDays(today(), -7), to: today() });

    expect(res.body.thoughtRecords[0].alternativeDeadline).toEqual({ date: addDays(today(), 1), time: '09:00' });
  });

  it('registro sem prazo congelado: congela na primeira vez que a paciente o vê', async () => {
    const { id } = await seedRecord(patientId, daysAgo(1), null);
    const appointment = await seedAppointment(addDays(today(), 1), '10:00');
    const agent = await loginAgent();
    const range = { from: addDays(today(), -7), to: today() };

    await agent.get('/thought-records').query(range);
    const stored = await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } });
    expect(stored.alternativeDeadlineAt).toEqual(deadlineInstant({ date: addDays(today(), 1), time: '10:00' }));

    // Trocar a consulta por uma mais adiante não estende o prazo congelado.
    await prisma.appointment.delete({ where: { id: appointment.id } });
    await seedAppointment(addDays(today(), 5), '10:00');
    const again = await agent.get('/thought-records').query(range);
    expect(again.body.thoughtRecords[0].alternativeDeadline).toEqual({ date: addDays(today(), 1), time: '10:00' });
  });

  it('a leitura da terapeuta não grava nada', async () => {
    const { id } = await seedRecord(patientId, daysAgo(1), null);
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent(THERAPIST))
      .get(`/therapist/patients/${patientId}/thought-records`)
      .query({ from: addDays(today(), -7), to: today() });

    expect(res.status).toBe(200);
    expect((await prisma.thoughtRecord.findUniqueOrThrow({ where: { id } })).alternativeDeadlineAt).toBeNull();
  });

  it('vale o que vier primeiro, sem banco', () => {
    const frozen = deadlineInstant({ date: '2026-10-17', time: '10:00' });
    const later = { date: '2026-10-24', time: '10:00' };
    const earlier = { date: '2026-10-15', time: '18:00' };

    expect(effectiveDeadline(null, later)).toEqual(later);
    expect(effectiveDeadline(frozen, later)).toEqual({ date: '2026-10-17', time: '10:00' });
    expect(effectiveDeadline(frozen, earlier)).toEqual(earlier);
    expect(effectiveDeadline(frozen, null)).toEqual({ date: '2026-10-17', time: '10:00' });
    expect(effectiveDeadline(null, null)).toBeNull();
  });
});

describe('a lista diz quando dá para adicionar (DEC-054)', () => {
  it('prazo e permissão em cada registro; a terapeuta lê os campos novos', async () => {
    const open = await seedRecord(patientId, daysAgo(2));
    await seedAppointment(addDays(today(), 1), '09:30');
    const range = { from: addDays(today(), -7), to: today() };

    const patient = await (await loginAgent()).get('/thought-records').query(range);
    const [record] = patient.body.thoughtRecords;
    expect(record.id).toBe(open.id);
    expect(record.alternativeDeadline).toEqual({ date: addDays(today(), 1), time: '09:30' });
    expect(record.canAddAlternative).toBe(true);
    expect(record.alternativeExplanation).toBeNull();
    expect(record.alternativeAddedAt).toBeNull();

    const therapist = await (await loginAgent(THERAPIST))
      .get(`/therapist/patients/${patientId}/thought-records`)
      .query(range);
    expect(therapist.status).toBe(200);
    expect(therapist.body.thoughtRecords[0]).toMatchObject({ alternativeExplanation: null, alternativeAddedAt: null });
  });

  it('registro de hoje: edita pelo formulário, sem a rota própria', async () => {
    await seedRecord(patientId, new Date());
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent()).get('/thought-records').query({ from: today(), to: today() });

    expect(res.body.thoughtRecords[0]).toMatchObject({ editable: true, canAddAlternative: false });
  });

  it('sem consulta agendada: sem prazo e sem permissão', async () => {
    await seedRecord();

    const res = await (await loginAgent()).get('/thought-records').query({ from: addDays(today(), -7), to: today() });

    expect(res.body.thoughtRecords[0]).toMatchObject({ alternativeDeadline: null, canAddAlternative: false });
  });
});

describe('no dia do registro, pelo formulário (DEC-054)', () => {
  it('cria com a alternativa e a reavaliação; a data da alternativa é marcada', async () => {
    const emotions = [
      { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 3 },
      { emotion: 'MEDO', intensity: 5, intensityAfter: 2 },
    ];
    const res = await (await loginAgent())
      .post('/thought-records')
      .send(newRecordBody({ alternativeExplanation: 'Alternativa fictícia', emotions }));

    expect(res.status).toBe(201);
    expect(res.body.thoughtRecord.alternativeExplanation).toBe('Alternativa fictícia');
    expect(res.body.thoughtRecord.alternativeAddedAt).not.toBeNull();
    expect(res.body.thoughtRecord.emotions[0].intensityAfter).toBe(3);
  });

  it('a alternativa é opcional', async () => {
    const res = await (await loginAgent()).post('/thought-records').send(newRecordBody());

    expect(res.status).toBe(201);
    expect(res.body.thoughtRecord).toMatchObject({ alternativeExplanation: null, alternativeAddedAt: null });
  });

  it('reavaliação sem alternativa, ou só de algumas emoções: 400', async () => {
    const agent = await loginAgent();
    const withoutAlternative = newRecordBody({
      emotions: [
        { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 3 },
        { emotion: 'MEDO', intensity: 5, intensityAfter: 2 },
      ],
    });
    const partial = newRecordBody({
      alternativeExplanation: 'Alternativa fictícia',
      emotions: [
        { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 3 },
        { emotion: 'MEDO', intensity: 5 },
      ],
    });

    expect((await agent.post('/thought-records').send(withoutAlternative)).status).toBe(400);
    expect((await agent.post('/thought-records').send(partial)).status).toBe(400);
    expect(await prisma.thoughtRecord.count()).toBe(0);
  });

  it('na edição: mudar o texto mantém a data; apagar a alternativa apaga a reavaliação', async () => {
    const agent = await loginAgent();
    const created = await agent.post('/thought-records').send(
      newRecordBody({
        alternativeExplanation: 'Alternativa fictícia',
        emotions: [
          { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 3 },
          { emotion: 'MEDO', intensity: 5, intensityAfter: 2 },
        ],
      }),
    );
    const { id, alternativeAddedAt } = created.body.thoughtRecord;

    const changed = await agent.patch(`/thought-records/${id}`).send({ alternativeExplanation: 'Texto revisto' });
    expect(changed.body.thoughtRecord.alternativeExplanation).toBe('Texto revisto');
    expect(changed.body.thoughtRecord.alternativeAddedAt).toBe(alternativeAddedAt);

    const cleared = await agent.patch(`/thought-records/${id}`).send({ alternativeExplanation: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.thoughtRecord).toMatchObject({ alternativeExplanation: null, alternativeAddedAt: null });
    expect(cleared.body.thoughtRecord.emotions.every((e: { intensityAfter: null }) => e.intensityAfter === null)).toBe(
      true,
    );
  });

  it('na edição: reavaliação sem alternativa gravada nem enviada é 400', async () => {
    const agent = await loginAgent();
    const { id } = (await agent.post('/thought-records').send(newRecordBody())).body.thoughtRecord;

    const res = await agent.patch(`/thought-records/${id}`).send({
      emotions: [
        { emotion: 'ANSIEDADE', intensity: 8, intensityAfter: 3 },
        { emotion: 'MEDO', intensity: 5, intensityAfter: 2 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ALTERNATIVE_REQUIRED');
  });

  it('depois do dia, o PATCH continua travado, inclusive para a alternativa', async () => {
    const { id } = await seedRecord();
    await seedAppointment(addDays(today(), 1));

    const res = await (await loginAgent()).patch(`/thought-records/${id}`).send(alternative());

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('THOUGHT_RECORD_LOCKED');
  });
});

describe('o prazo, sem banco (DEC-054)', () => {
  // São Paulo é UTC-3 (sem horário de verão desde 2019).
  const deadline = { date: '2026-10-17', time: '10:00' };

  it('vale até a hora marcada: 09:59 ainda dá, 10:00 não', () => {
    expect(isBeforeDeadline(deadline, new Date('2026-10-17T12:59:00Z'))).toBe(true);
    expect(isBeforeDeadline(deadline, new Date('2026-10-17T13:00:00Z'))).toBe(false);
  });

  it('consulta sem hora (avulsa antiga): até o dia anterior', () => {
    const noTime = { date: '2026-10-17', time: null };
    expect(isBeforeDeadline(noTime, new Date('2026-10-17T02:59:00Z'))).toBe(true); // 16/10, 23:59
    expect(isBeforeDeadline(noTime, new Date('2026-10-17T03:00:00Z'))).toBe(false);
  });

  it('a consulta é a primeira que ainda não tinha começado quando o registro foi feito', () => {
    const agenda: AgendaData = {
      schedules: [],
      exceptions: [],
      pauses: [],
      extras: [
        { id: 'a', date: '2026-10-14', time: '08:00' },
        { id: 'b', date: '2026-10-21', time: '10:00' },
      ],
    };
    const sessions = scheduledSessionsFrom(agenda, '2026-10-14', '2026-10-14');

    // Registro às 09:00 de 14/10 (12:00 UTC): a consulta das 08:00 já tinha começado.
    expect(deadlineFor(sessions, new Date('2026-10-14T12:00:00Z'))).toEqual({ date: '2026-10-21', time: '10:00' });
    // Registro às 07:00 do mesmo dia: vale a das 08:00.
    expect(deadlineFor(sessions, new Date('2026-10-14T10:00:00Z'))).toEqual({ date: '2026-10-14', time: '08:00' });
  });

  it('sessão desmarcada não conta como próxima consulta', () => {
    const agenda: AgendaData = {
      schedules: [{ id: 's', startDate: '2026-10-07', time: '10:00', frequency: 'SEMANAL', endDate: null }],
      exceptions: [
        { scheduleId: 's', originalDate: '2026-10-14', type: 'DESMARCADA', newDate: null, newTime: null, reason: 'Motivo fictício' },
      ],
      pauses: [],
      extras: [],
    };
    const sessions = scheduledSessionsFrom(agenda, '2026-10-08', '2026-10-08');

    expect(deadlineFor(sessions, new Date('2026-10-08T15:00:00Z'))).toEqual({ date: '2026-10-21', time: '10:00' });
  });
});
