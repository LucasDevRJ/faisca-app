import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { MEDICATIONS_MAX } from './medications.schema.js';
import { timelineError } from './medications.service.js';

// Remédios e o que sinto (DEC-114, #171). Dados fictícios (regra 5): remédios e sintomas inventados.
const VERSION = '2026-11.8';
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherId: string;
let therapistId: string;
let today: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  today = todayInAppZone();
  patientId = (await createConfirmedUser({ privacyVersion: VERSION })).id;
  otherId = (await createConfirmedUser({ email: 'outra@faisca.test', privacyVersion: VERSION })).id;
  therapistId = (
    await createConfirmedUser({
      email: 'psiquiatra@faisca.test',
      patient: false,
      therapist: true,
      privacyVersion: VERSION,
      professionalKind: 'PSIQUIATRIA',
    })
  ).id;
  await createConfirmedUser({ email: 'sem-vinculo@faisca.test', patient: false, therapist: true, privacyVersion: VERSION });
  await createConfirmedUser({ email: 'sem-aceite@faisca.test', privacyVersion: '2026-11.7' });
});

async function login(email = 'paciente@faisca.test') {
  const agent = request.agent(app);
  expect((await agent.post('/auth/login').send({ email, password: 'senha-ficticia-123' })).status).toBe(200);
  return agent;
}

type Agent = Awaited<ReturnType<typeof login>>;

async function newMedication(agent: Agent, body: Record<string, unknown> = {}) {
  const res = await agent
    .post('/medications')
    .send({ name: 'Remédio Fictício A', dose: '50 mg', schedule: 'de manhã', startedOn: addDays(today, -30), ...body });
  expect(res.status).toBe(201);
  return res.body.medication as { id: string; changes: { id: string; kind: string }[] };
}

describe('linha do tempo (sem banco)', () => {
  const at = (kind: 'COMECOU' | 'MUDOU_DOSE' | 'PAROU', date: string, order = 0) => ({
    kind,
    changeDate: new Date(`${date}T00:00:00Z`),
    createdAt: new Date(1_700_000_000_000 + order),
  });

  it('começa, muda a dose, para e volta: faz sentido', () => {
    expect(
      timelineError([at('COMECOU', '2026-01-01'), at('MUDOU_DOSE', '2026-02-01'), at('PAROU', '2026-03-01'), at('COMECOU', '2026-04-01')]),
    ).toBeNull();
  });

  it('recusa o que não faz sentido', () => {
    expect(timelineError([])).not.toBeNull();
    expect(timelineError([at('MUDOU_DOSE', '2026-01-01')])).toMatch(/começo/);
    expect(timelineError([at('COMECOU', '2026-02-01'), at('MUDOU_DOSE', '2026-01-01')])).toMatch(/começo/);
    expect(timelineError([at('COMECOU', '2026-01-01'), at('COMECOU', '2026-02-01')])).toMatch(/já estava em uso/);
    expect(timelineError([at('COMECOU', '2026-01-01'), at('PAROU', '2026-02-01'), at('PAROU', '2026-03-01')])).toMatch(
      /não estava em uso/,
    );
  });

  it('no mesmo dia, vale a ordem em que foram anotadas', () => {
    expect(timelineError([at('COMECOU', '2026-01-01', 0), at('PAROU', '2026-01-01', 1)])).toBeNull();
    expect(timelineError([at('COMECOU', '2026-01-01', 1), at('PAROU', '2026-01-01', 0)])).not.toBeNull();
  });
});

describe('paciente: remédios e mudanças', () => {
  it('anota o remédio, muda a dose e para; a dose atual e o "em uso" saem das mudanças', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    expect(medication).toMatchObject({
      name: 'Remédio Fictício A',
      schedule: 'de manhã',
      dose: '50 mg',
      active: true,
      startedOn: addDays(today, -30),
      stoppedOn: null,
      changes: [{ kind: 'COMECOU', changeDate: addDays(today, -30), dose: '50 mg', note: null }],
    });
    expect(medication).not.toHaveProperty('userId');

    const changed = await agent
      .post(`/medications/${medication.id}/changes`)
      .send({ kind: 'MUDOU_DOSE', changeDate: addDays(today, -10), dose: '100 mg', note: 'a médica aumentou' });
    expect(changed.status).toBe(201);
    expect(changed.body.medication).toMatchObject({ dose: '100 mg', active: true });

    const stopped = await agent.post(`/medications/${medication.id}/changes`).send({ kind: 'PAROU', changeDate: today });
    expect(stopped.body.medication).toMatchObject({ active: false, dose: null, stoppedOn: today });
    expect(stopped.body.medication.changes.map((c: { kind: string }) => c.kind)).toEqual(['COMECOU', 'MUDOU_DOSE', 'PAROU']);

    const list = await agent.get('/medications');
    expect(list.status).toBe(200);
    expect(list.body).toEqual({
      medications: [expect.objectContaining({ id: medication.id, active: false })],
      symptoms: [],
      listsMedications: false,
    });
  });

  it('muda o nome e o horário direto; a dose só por uma mudança com data', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    const res = await agent.patch(`/medications/${medication.id}`).send({ name: 'Remédio Fictício B', schedule: '' });
    expect(res.status).toBe(200);
    expect(res.body.medication).toMatchObject({ name: 'Remédio Fictício B', schedule: null, dose: '50 mg' });
    expect((await agent.patch(`/medications/${medication.id}`).send({ dose: '10 mg' })).status).toBe(400);
  });

  it('recusa a linha do tempo sem sentido e as datas no futuro', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    const path = `/medications/${medication.id}/changes`;

    const again = await agent.post(path).send({ kind: 'COMECOU', changeDate: today, dose: '10 mg' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('MEDICATION_TIMELINE_INVALID');
    // Antes do começo, não dá para mudar a dose.
    expect((await agent.post(path).send({ kind: 'MUDOU_DOSE', changeDate: addDays(today, -40), dose: '10 mg' })).status).toBe(409);
    // MUDOU_DOSE pede a dose nova; PAROU não leva dose.
    expect((await agent.post(path).send({ kind: 'MUDOU_DOSE', changeDate: today })).status).toBe(400);
    expect((await agent.post(path).send({ kind: 'PAROU', changeDate: today, dose: '10 mg' })).status).toBe(400);

    const future = await agent.post(path).send({ kind: 'PAROU', changeDate: addDays(today, 1) });
    expect(future.status).toBe(400);
    expect(future.body.error.code).toBe('DATE_IN_FUTURE');
    expect((await agent.post('/medications').send({ name: 'X', startedOn: addDays(today, 1) })).status).toBe(400);
    expect((await agent.post('/medications').send({ name: 'X', startedOn: '1949-12-31' })).status).toBe(400);
    expect(await prisma.medicationChange.count()).toBe(1);
  });

  it('volta a tomar depois de parar; edita e apaga mudanças sem quebrar a linha do tempo', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    const path = `/medications/${medication.id}/changes`;
    const stop = (await agent.post(path).send({ kind: 'PAROU', changeDate: addDays(today, -20) })).body.medication;
    const restart = await agent.post(path).send({ kind: 'COMECOU', changeDate: addDays(today, -5), dose: '25 mg' });
    expect(restart.body.medication).toMatchObject({ active: true, dose: '25 mg', startedOn: addDays(today, -30) });

    const stopId = stop.changes.find((c: { kind: string }) => c.kind === 'PAROU').id;
    // Apagar o PAROU deixaria dois começos seguidos.
    expect((await agent.delete(`${path}/${stopId}`)).status).toBe(409);
    // Mover o PAROU para antes do começo também não.
    expect((await agent.patch(`${path}/${stopId}`).send({ changeDate: addDays(today, -31) })).status).toBe(409);
    const moved = await agent.patch(`${path}/${stopId}`).send({ changeDate: addDays(today, -15), note: 'efeito forte' });
    expect(moved.status).toBe(200);
    expect(moved.body.medication.changes[1]).toMatchObject({ kind: 'PAROU', changeDate: addDays(today, -15), note: 'efeito forte' });

    // O único começo não sai: para tirar tudo, apaga o remédio.
    const single = await newMedication(agent, { name: 'Remédio Fictício C' });
    const only = await agent.delete(`/medications/${single.id}/changes/${single.changes[0]!.id}`);
    expect(only.status).toBe(409);
    expect((await agent.delete(`/medications/${single.id}`)).status).toBe(204);
    expect(await prisma.medication.count({ where: { id: single.id } })).toBe(0);
  });

  it('a mudança precisa ser do próprio remédio', async () => {
    const agent = await login();
    const first = await newMedication(agent);
    const second = await newMedication(agent, { name: 'Remédio Fictício B' });
    const res = await agent.patch(`/medications/${second.id}/changes/${first.changes[0]!.id}`).send({ note: 'x' });
    expect(res.status).toBe(404);
  });

  it('textos no limite do CHECK passam e um a mais não', async () => {
    const agent = await login();
    expect((await agent.post('/medications').send({ name: 'a'.repeat(60), dose: 'b'.repeat(40), schedule: 'c'.repeat(40), startedOn: today })).status).toBe(201);
    expect((await agent.post('/medications').send({ name: 'a'.repeat(61), startedOn: today })).status).toBe(400);
    expect((await agent.post('/medications').send({ name: 'ok', dose: 'b'.repeat(41), startedOn: today })).status).toBe(400);
    expect((await agent.post('/medications').send({ name: '   ', startedOn: today })).status).toBe(400);
    expect((await agent.post('/medications').send({ name: 'nulo\u0000', startedOn: today })).status).toBe(400);
    // Formatação invisível: espaço de largura zero e o que inverte a direção do texto.
    expect((await agent.post('/medications').send({ name: '​', startedOn: today })).status).toBe(400);
    expect((await agent.post('/medications').send({ name: 'abc‮def', startedOn: today })).status).toBe(400);
    // A observação aceita quebra de linha, mas não o nulo.
    expect((await agent.post('/symptoms').send({ description: 'ok', startedOn: today, note: 'linha 1\nlinha 2' })).status).toBe(201);
    expect((await agent.post('/symptoms').send({ description: 'ok', startedOn: today, note: 'x\u0000' })).status).toBe(400);
  });

  it(`até ${MEDICATIONS_MAX} remédios por conta`, async () => {
    await prisma.medication.createMany({
      data: Array.from({ length: MEDICATIONS_MAX }, (_, i) => ({ userId: patientId, name: `Remédio Fictício ${i}` })),
    });
    const res = await (await login()).post('/medications').send({ name: 'Mais um', startedOn: today });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEDICATIONS_LIMIT');
  });

  it('a opção em Conta liga e desliga sem apagar nada', async () => {
    const agent = await login();
    await newMedication(agent);
    expect((await agent.put('/medications/settings').send({ listsMedications: true })).body).toEqual({ listsMedications: true });
    expect((await agent.get('/medications')).body.listsMedications).toBe(true);
    await agent.put('/medications/settings').send({ listsMedications: false });
    expect((await agent.get('/medications')).body.medications).toHaveLength(1);
  });
});

describe('paciente: o que tenho sentido', () => {
  it('anota o sintoma ligado à mudança e conta os dias desde ela', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    await agent
      .post(`/medications/${medication.id}/changes`)
      .send({ kind: 'MUDOU_DOSE', changeDate: addDays(today, -10), dose: '100 mg' });

    const res = await agent.post('/symptoms').send({
      description: 'enjoo de manhã',
      startedOn: addDays(today, -5),
      intensity: 6,
      medicationId: medication.id,
      note: 'passa depois do café\nmelhor com comida',
    });
    expect(res.status).toBe(201);
    expect(res.body.symptom).toMatchObject({
      description: 'enjoo de manhã',
      startedOn: addDays(today, -5),
      endedOn: null,
      medicationId: medication.id,
      sinceChange: { medicationId: medication.id, kind: 'MUDOU_DOSE', date: addDays(today, -10), days: 5 },
      checks: [{ date: addDays(today, -5), intensity: 6 }],
    });
    expect(res.body.symptom).not.toHaveProperty('userId');
  });

  it('"como está agora" registra a evolução, um por dia, dentro do período do sintoma', async () => {
    const agent = await login();
    const symptom = (await agent.post('/symptoms').send({ description: 'sonolência', startedOn: addDays(today, -7), intensity: 8 })).body.symptom;
    const path = `/symptoms/${symptom.id}/checks`;

    expect((await agent.put(`${path}/${addDays(today, -3)}`).send({ intensity: 5 })).status).toBe(200);
    const res = await agent.put(`${path}/${addDays(today, -3)}`).send({ intensity: 4 });
    expect(res.body.symptom.checks).toEqual([
      { date: addDays(today, -7), intensity: 8 },
      { date: addDays(today, -3), intensity: 4 },
    ]);

    const before = await agent.put(`${path}/${addDays(today, -8)}`).send({ intensity: 3 });
    expect(before.status).toBe(400);
    expect(before.body.error.code).toBe('CHECK_OUTSIDE_SYMPTOM');
    expect((await agent.put(`${path}/${addDays(today, 1)}`).send({ intensity: 3 })).status).toBe(400);
    expect((await agent.put(`${path}/${today}`).send({ intensity: 11 })).status).toBe(400);

    // "Já passou": o fim não pode deixar anotações de fora, nem ser antes do começo.
    const cut = await agent.patch(`/symptoms/${symptom.id}`).send({ endedOn: addDays(today, -4) });
    expect(cut.status).toBe(409);
    expect(cut.body.error.code).toBe('SYMPTOM_CHECKS_OUTSIDE');
    expect((await agent.patch(`/symptoms/${symptom.id}`).send({ endedOn: addDays(today, -9) })).status).toBe(400);
    const ended = await agent.patch(`/symptoms/${symptom.id}`).send({ endedOn: addDays(today, -2) });
    expect(ended.body.symptom.endedOn).toBe(addDays(today, -2));
    expect((await agent.put(`${path}/${today}`).send({ intensity: 1 })).status).toBe(400);

    expect((await agent.delete(`${path}/${addDays(today, -3)}`)).body.symptom.checks).toHaveLength(1);
    expect((await agent.delete(`${path}/${addDays(today, -3)}`)).status).toBe(404);
    expect((await agent.patch(`/symptoms/${symptom.id}`).send({ endedOn: null })).body.symptom.endedOn).toBeNull();
  });

  it('apagar o remédio mantém o sintoma, sem a ligação', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    const symptom = (await agent.post('/symptoms').send({ description: 'boca seca', startedOn: today, medicationId: medication.id })).body.symptom;
    await agent.delete(`/medications/${medication.id}`);
    const list = (await agent.get('/medications')).body;
    expect(list.symptoms).toEqual([expect.objectContaining({ id: symptom.id, medicationId: null, sinceChange: null })]);
  });

  it('sintoma que começou antes do remédio não tem "dias desde a mudança"', async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    const res = await agent.post('/symptoms').send({ description: 'dor de cabeça', startedOn: addDays(today, -40), medicationId: medication.id });
    expect(res.body.symptom.sinceChange).toBeNull();
  });
});

describe('autorização do paciente (regra 1)', () => {
  // Todas as rotas do paciente, para conferir cada proteção em cada uma.
  const id = '00000000-0000-4000-8000-000000000000';
  const allRoutes = (agent: Agent | ReturnType<typeof request>) => [
    () => agent.get('/medications'),
    () => agent.put('/medications/settings').send({ listsMedications: true }),
    () => agent.post('/medications').send({ name: 'X', startedOn: today }),
    () => agent.patch(`/medications/${id}`).send({ name: 'X' }),
    () => agent.delete(`/medications/${id}`),
    () => agent.post(`/medications/${id}/changes`).send({ kind: 'PAROU', changeDate: today }),
    () => agent.patch(`/medications/${id}/changes/${id}`).send({ note: 'x' }),
    () => agent.delete(`/medications/${id}/changes/${id}`),
    () => agent.post('/symptoms').send({ description: 'x', startedOn: today }),
    () => agent.patch(`/symptoms/${id}`).send({ description: 'x' }),
    () => agent.delete(`/symptoms/${id}`),
    () => agent.put(`/symptoms/${id}/checks/${today}`).send({ intensity: 1 }),
    () => agent.delete(`/symptoms/${id}/checks/${today}`),
  ];

  it('sem sessão, 401 em todas as rotas', async () => {
    for (const call of allRoutes(request(app))) expect((await call()).status).toBe(401);
  });

  it('conta só de profissional não usa nenhuma rota do paciente', async () => {
    for (const call of allRoutes(await login('psiquiatra@faisca.test'))) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    }
    expect(await prisma.medication.count()).toBe(0);
  });

  it('sem o aceite da 2026-11.8, 403 pedindo o aceite em todas as rotas', async () => {
    for (const call of allRoutes(await login('sem-aceite@faisca.test'))) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
  });

  it('o de outra pessoa: não aparece, não muda, não apaga e não pode ser ligado', async () => {
    const other = await login('outra@faisca.test');
    const theirs = await newMedication(other);
    const theirSymptom = (await other.post('/symptoms').send({ description: 'tontura', startedOn: today })).body.symptom;

    await other.put(`/symptoms/${theirSymptom.id}/checks/${today}`).send({ intensity: 2 });

    const agent = await login();
    const mine = (await agent.post('/symptoms').send({ description: 'meu sintoma', startedOn: today })).body.symptom;
    expect((await agent.get('/medications')).body).toMatchObject({
      medications: [],
      symptoms: [expect.objectContaining({ id: mine.id })],
    });
    for (const res of [
      await agent.patch(`/medications/${theirs.id}`).send({ name: 'trocado' }),
      await agent.delete(`/medications/${theirs.id}`),
      await agent.post(`/medications/${theirs.id}/changes`).send({ kind: 'PAROU', changeDate: today }),
      await agent.delete(`/medications/${theirs.id}/changes/${theirs.changes[0]!.id}`),
      await agent.patch(`/symptoms/${theirSymptom.id}`).send({ description: 'trocado' }),
      await agent.delete(`/symptoms/${theirSymptom.id}`),
      await agent.put(`/symptoms/${theirSymptom.id}/checks/${today}`).send({ intensity: 9 }),
      await agent.delete(`/symptoms/${theirSymptom.id}/checks/${today}`),
      await agent.patch(`/medications/${theirs.id}/changes/${theirs.changes[0]!.id}`).send({ note: 'trocada' }),
      await agent.post('/symptoms').send({ description: 'meu', startedOn: today, medicationId: theirs.id }),
      await agent.patch(`/symptoms/${mine.id}`).send({ medicationId: theirs.id }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.medication.findUniqueOrThrow({ where: { id: theirs.id } })).toMatchObject({ name: 'Remédio Fictício A' });
    expect(await prisma.medicationChange.count({ where: { medicationId: theirs.id } })).toBe(1);
    expect(await prisma.symptom.findUniqueOrThrow({ where: { id: theirSymptom.id } })).toMatchObject({ description: 'tontura' });
    expect(await prisma.symptomCheck.findFirstOrThrow({ where: { symptomId: theirSymptom.id } })).toMatchObject({ intensity: 2 });
    expect(await prisma.medicationChange.findFirstOrThrow({ where: { medicationId: theirs.id } })).toMatchObject({ note: null });
    expect(await prisma.symptom.findUniqueOrThrow({ where: { id: mine.id } })).toMatchObject({ medicationId: null });
    expect(await prisma.symptom.count({ where: { userId: patientId } })).toBe(1);
  });

  it('userId ou patientId no corpo, 400', async () => {
    const agent = await login();
    expect((await agent.post('/medications').send({ name: 'X', startedOn: today, userId: otherId })).status).toBe(400);
    expect((await agent.post('/symptoms').send({ description: 'x', startedOn: today, patientId: otherId })).status).toBe(400);
    expect(await prisma.medication.count({ where: { userId: otherId } })).toBe(0);
  });
});

describe('profissional: só leitura, só com a caixa liberada', () => {
  const base = () => `/therapist/patients/${patientId}/medications`;

  beforeEach(async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    await agent.post('/symptoms').send({ description: 'insônia', startedOn: addDays(today, -3), intensity: 7, medicationId: medication.id });
  });

  it('com a caixa Remédios e o que sinto: vê os remédios e os sintomas, sem a opção de Conta', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATIONS'] });
    const res = await (await login('psiquiatra@faisca.test')).get(base());
    expect(res.status).toBe(200);
    expect(res.body.medications).toEqual([expect.objectContaining({ name: 'Remédio Fictício A', dose: '50 mg' })]);
    expect(res.body.symptoms).toEqual([expect.objectContaining({ description: 'insônia', checks: [{ date: addDays(today, -3), intensity: 7 }] })]);
    expect(res.body).not.toHaveProperty('listsMedications');
    expect(JSON.stringify(res.body)).not.toContain(patientId);
  });

  it('só com o "tomou como combinado?" (MEDICATION), 403; liberar abre e desmarcar fecha na hora', async () => {
    const link = await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATION', 'SLEEP_MOOD'] });
    const agent = await login('psiquiatra@faisca.test');
    expect((await agent.get(base())).status).toBe(403);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { sharedAreas: ['MEDICATION', 'MEDICATIONS'] } });
    expect((await agent.get(base())).status).toBe(200);
    await prisma.therapistLink.update({ where: { id: link.id }, data: { sharedAreas: ['MEDICATION'] } });
    expect((await agent.get(base())).status).toBe(403);
  });

  it('sem vínculo, outro paciente, vínculo desfeito, id que não é UUID ou sem o aceite dela: 403', async () => {
    const link = await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATIONS'] });
    expect((await (await login('sem-vinculo@faisca.test')).get(base())).status).toBe(403);
    const agent = await login('psiquiatra@faisca.test');
    expect((await agent.get(`/therapist/patients/${otherId}/medications`)).status).toBe(403);
    expect((await agent.get('/therapist/patients/nao-e-uuid/medications')).status).toBe(403);

    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: '2026-11.7' } });
    const old = await agent.get(base());
    expect(old.status).toBe(403);
    expect(old.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');

    await prisma.user.update({ where: { id: therapistId }, data: { privacyVersion: VERSION } });
    await prisma.therapistLink.update({ where: { id: link.id }, data: { revokedAt: new Date() } });
    expect((await agent.get(base())).status).toBe(403);
  });

  it('a psicóloga também lê, se o paciente liberar para ela', async () => {
    const psychologist = await createConfirmedUser({
      email: 'psicologa@faisca.test',
      patient: false,
      therapist: true,
      privacyVersion: VERSION,
    });
    await createTestLink({ patientId, therapistId: psychologist.id, kind: 'PSICOLOGIA', sharedAreas: ['MEDICATIONS'] });
    expect((await (await login('psicologa@faisca.test')).get(base())).status).toBe(200);
  });

  it('nunca escreve: POST, PATCH, PUT e DELETE são 403, e a rota do paciente também', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATIONS'] });
    const agent = await login('psiquiatra@faisca.test');
    const medication = await prisma.medication.findFirstOrThrow({ where: { userId: patientId } });
    expect((await agent.post(base()).send({ name: 'X', startedOn: today })).status).toBe(403);
    expect((await agent.patch(`${base()}/${medication.id}`).send({ name: 'X' })).status).toBe(403);
    expect((await agent.put(`${base()}/settings`).send({ listsMedications: true })).status).toBe(403);
    expect((await agent.delete(`${base()}/${medication.id}`)).status).toBe(403);
    expect((await agent.patch(`/medications/${medication.id}`).send({ name: 'X' })).status).toBe(403);
    expect((await request(app).post(base()).send({ name: 'X' })).status).toBe(403);
    expect((await request(app).get(base())).status).toBe(401);
    expect((await (await login()).get(base())).status).toBe(403);
    expect(await prisma.medication.findUniqueOrThrow({ where: { id: medication.id } })).toMatchObject({ name: 'Remédio Fictício A' });
  });
});

describe('resumo do período', () => {
  const week = () => `from=${addDays(today, -6)}&to=${today}`;

  beforeEach(async () => {
    const agent = await login();
    const medication = await newMedication(agent);
    await agent.post(`/medications/${medication.id}/changes`).send({ kind: 'MUDOU_DOSE', changeDate: addDays(today, -2), dose: '75 mg' });
    const symptom = (await agent.post('/symptoms').send({ description: 'tremor leve', startedOn: addDays(today, -1), intensity: 4 })).body.symptom;
    await agent.put(`/symptoms/${symptom.id}/checks/${today}`).send({ intensity: 6 });
  });

  it('no paciente: só números e datas, sem o nome do remédio nem o texto do sintoma', async () => {
    const res = await (await login()).get(`/period-summary?${week()}`);
    expect(res.status).toBe(200);
    expect(res.body.medications.current).toEqual({
      activeMedications: 1,
      changes: [{ date: addDays(today, -2), kind: 'MUDOU_DOSE' }],
      newSymptoms: 1,
      endedSymptoms: 0,
      maxIntensity: 6,
    });
    // O COMECOU (30 dias atrás) fica fora dos dois períodos de 7 dias.
    expect(res.body.medications.previous).toEqual({ activeMedications: 1, changes: [], newSymptoms: 0, endedSymptoms: 0, maxIntensity: null });
    expect(res.body.daysWithRecords.current).toBe(3);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Remédio Fictício');
    expect(text).not.toContain('tremor');
    expect(text).not.toContain('75 mg');
  });

  it('na profissional: caixa fechada vem null e não conta nos dias', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATION'] });
    const res = await (await login('psiquiatra@faisca.test')).get(`/therapist/patients/${patientId}/period-summary?${week()}`);
    expect(res.status).toBe(200);
    expect(res.body.medications).toBeNull();
    expect(res.body.daysWithRecords.current).toBe(0);
  });

  it('com a caixa liberada, a profissional vê os mesmos números', async () => {
    await createTestLink({ patientId, therapistId, kind: 'PSIQUIATRIA', sharedAreas: ['MEDICATIONS'] });
    const res = await (await login('psiquiatra@faisca.test')).get(`/therapist/patients/${patientId}/period-summary?${week()}`);
    expect(res.body.medications.current).toMatchObject({ activeMedications: 1, newSymptoms: 1, maxIntensity: 6 });
  });
});
