import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, createTestLink, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { patientReadReceipts, professionalReadReceipts } from './read-receipts.service.js';

// "Lido" para o paciente (SPEC, "Lido para o paciente"; DEC-117). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const VERSION = '2026-11.10';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const PSYCHOLOGIST = 'psicologa@faisca.test';
const PSYCHIATRIST = 'psiquiatra@faisca.test';
const OUTSIDER = 'outra-terapeuta@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;
let psychologistId: string;
let psychiatristId: string;
let psychologistLinkId: string;
let psychiatristLinkId: string;
let otherLinkId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT, privacyVersion: VERSION })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT, privacyVersion: VERSION })).id;
  const professional = (email: string, professionalKind: 'PSICOLOGIA' | 'PSIQUIATRIA') =>
    createConfirmedUser({ email, patient: false, therapist: true, privacyVersion: VERSION, professionalKind });
  psychologistId = (await professional(PSYCHOLOGIST, 'PSICOLOGIA')).id;
  psychiatristId = (await professional(PSYCHIATRIST, 'PSIQUIATRIA')).id;
  const outsiderId = (await professional(OUTSIDER, 'PSICOLOGIA')).id;
  psychologistLinkId = (await createTestLink({ patientId, therapistId: psychologistId })).id;
  psychiatristLinkId = (await createTestLink({ patientId, therapistId: psychiatristId, kind: 'PSIQUIATRIA' })).id;
  otherLinkId = (await createTestLink({ patientId: otherPatientId, therapistId: outsiderId })).id;
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const request_ = (linkId: string) => `/link/${linkId}/read-receipts`;
const share = (id = patientId) => `/therapist/read-receipts/${id}`;

function seedThought(userId = patientId) {
  return prisma.thoughtRecord.create({
    data: {
      userId,
      situationDate: dateOnlyToDate(todayInAppZone()),
      situation: 'Situação fictícia',
      automaticThought: 'Pensamento fictício',
      beliefLevel: 6,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      emotions: { create: [{ emotion: 'ANSIEDADE', intensity: 7 }] },
    },
  });
}

function seedAction(userId = patientId) {
  return prisma.behavioralAction.create({
    data: {
      userId,
      actionDate: dateOnlyToDate(todayInAppZone()),
      name: 'Caminhada fictícia',
      category: 'PRAZER',
      expectation: 4,
    },
  });
}

// A profissional marca pela rota de verdade (DEC-057), para o teste passar pelo mesmo caminho.
async function markRead(email: string, items: { type: string; id: string }[]) {
  const res = await (await loginAgent(email)).put(`/therapist/read-marks/${patientId}`).send({ items });
  expect(res.status).toBe(200);
}

// Os dois lados ligados para a psicóloga.
async function turnOnForPsychologist() {
  expect((await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true })).status).toBe(
    200,
  );
  expect((await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true })).status).toBe(200);
}

describe('estado do pedido (funções puras)', () => {
  const at = new Date('2026-11-20T12:00:00Z');
  const link = (requested: Date | null, shared: Date | null, notNow: Date | null) => ({
    readReceiptsRequestedAt: requested,
    readReceiptsSharedAt: shared,
    readReceiptsNotNowAt: notNow,
  });

  it('o paciente nunca vê a recusa: "Agora não" continua como pedido enviado', () => {
    expect(patientReadReceipts(link(null, null, null))).toBe('OFF');
    expect(patientReadReceipts(link(at, null, null))).toBe('REQUESTED');
    expect(patientReadReceipts(link(at, null, at))).toBe('REQUESTED');
    expect(patientReadReceipts(link(at, at, null))).toBe('ON');
  });

  it('a profissional vê se há pedido, se respondeu "Agora não" ou se ativou', () => {
    expect(professionalReadReceipts(link(null, null, null))).toBe('OFF');
    expect(professionalReadReceipts(link(at, null, null))).toBe('PENDING');
    expect(professionalReadReceipts(link(at, null, at))).toBe('NOT_NOW');
    expect(professionalReadReceipts(link(at, at, null))).toBe('ON');
  });
});

describe('autorização do pedido do paciente (regra 1)', () => {
  it('sem sessão: 401', async () => {
    expect((await request(app).get('/read-receipts')).status).toBe(401);
    expect((await request(app).put(request_(psychologistLinkId)).send({ requested: true })).status).toBe(401);
  });

  it('conta só de profissional: 403, nada gravado', async () => {
    const agent = await loginAgent(PSYCHOLOGIST);
    const res = await agent.put(request_(psychologistLinkId)).send({ requested: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect((await agent.get('/read-receipts')).status).toBe(403);
    expect((await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } })).readReceiptsRequestedAt).toBeNull();
  });

  it('vínculo de outra pessoa ou desfeito: 404, e o banco continua igual', async () => {
    const agent = await loginAgent(PATIENT);
    const other = await agent.put(request_(otherLinkId)).send({ requested: true });
    expect(other.status).toBe(404);
    expect((await prisma.therapistLink.findUniqueOrThrow({ where: { id: otherLinkId } })).readReceiptsRequestedAt).toBeNull();

    await prisma.therapistLink.update({ where: { id: psychologistLinkId }, data: { revokedAt: new Date() } });
    expect((await agent.put(request_(psychologistLinkId)).send({ requested: true })).status).toBe(404);
  });

  it('corpo com campo a mais ou id que não é UUID: 400', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.put(request_(psychologistLinkId)).send({ requested: true, patientId })).status).toBe(400);
    expect((await agent.put(request_('nao-e-uuid')).send({ requested: true })).status).toBe(400);
    expect((await agent.put(request_(psychologistLinkId)).send({ requested: 'sim' })).status).toBe(400);
  });

  it('sem o aceite do aviso que cita o recurso: 403 PRIVACY_CONSENT_REQUIRED', async () => {
    await prisma.user.update({ where: { id: patientId }, data: { privacyVersion: '2026-11.9' } });
    const agent = await loginAgent(PATIENT);
    const res = await agent.put(request_(psychologistLinkId)).send({ requested: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect((await agent.get('/read-receipts')).status).toBe(403);
  });

  it('caso permitido: liga e desliga o pedido por profissional, e o /link mostra o estado', async () => {
    const agent = await loginAgent(PATIENT);
    const on = await agent.put(request_(psychologistLinkId)).send({ requested: true });
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ readReceipts: 'REQUESTED' });

    const status = await agent.get('/link');
    const byKind = Object.fromEntries(status.body.links.map((link: { kind: string; readReceipts: string }) => [link.kind, link.readReceipts]));
    // Uma escolha por profissional: a psiquiatra continua desligada.
    expect(byKind).toEqual({ PSICOLOGIA: 'REQUESTED', PSIQUIATRIA: 'OFF' });

    const off = await agent.put(request_(psychologistLinkId)).send({ requested: false });
    expect(off.body).toEqual({ readReceipts: 'OFF' });
  });

  it('pedir de novo não muda a data de um pedido que já existe', async () => {
    const agent = await loginAgent(PATIENT);
    await agent.put(request_(psychologistLinkId)).send({ requested: true });
    const first = (await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } })).readReceiptsRequestedAt;
    await agent.put(request_(psychologistLinkId)).send({ requested: true });
    const second = (await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } })).readReceiptsRequestedAt;

    expect(second).toEqual(first);
  });
});

describe('autorização da resposta da profissional (regra 1, exceção da DEC-117)', () => {
  it('sem sessão: 401; conta só de paciente: 403', async () => {
    expect((await request(app).put(share()).send({ shared: true })).status).toBe(401);
    const res = await (await loginAgent(PATIENT)).put(share()).send({ shared: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('THERAPIST_PROFILE_REQUIRED');
  });

  it('sem vínculo, vínculo desfeito ou patientId que não é UUID: 403, nada gravado', async () => {
    await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true });

    expect((await (await loginAgent(OUTSIDER)).put(share()).send({ shared: true })).status).toBe(403);
    expect((await (await loginAgent(PSYCHOLOGIST)).put(share('nao-e-uuid')).send({ shared: true })).status).toBe(403);

    await prisma.therapistLink.update({ where: { id: psychologistLinkId }, data: { revokedAt: new Date() } });
    expect((await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true })).status).toBe(403);
    expect((await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } })).readReceiptsSharedAt).toBeNull();
  });

  it('sem pedido do paciente: 409, nada gravado', async () => {
    const res = await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('READ_RECEIPTS_NOT_REQUESTED');
    expect((await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } })).readReceiptsSharedAt).toBeNull();
  });

  it('sem o aceite do aviso que cita o recurso: 403 PRIVACY_CONSENT_REQUIRED', async () => {
    await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true });
    await prisma.user.update({ where: { id: psychologistId }, data: { privacyVersion: '2026-11.9' } });
    const res = await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
  });

  it('responder ao pedido de uma não liga o da outra profissional', async () => {
    await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true });
    const res = await (await loginAgent(PSYCHIATRIST)).put(share()).send({ shared: true });

    expect(res.status).toBe(409);
  });

  it('caso permitido: ativa, "Agora não" e a lista de pacientes mostra o estado', async () => {
    await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true });
    const agent = await loginAgent(PSYCHOLOGIST);
    const pending = (await agent.get('/links/patients')).body.patients[0];
    expect(pending.readReceipts).toBe('PENDING');

    const notNow = await agent.put(share()).send({ shared: false });
    expect(notNow.body).toEqual({ readReceipts: 'NOT_NOW' });
    // Para o paciente, continua "Pedido enviado".
    const patientView = (await (await loginAgent(PATIENT)).get('/link')).body.links[0];
    expect(patientView.readReceipts).toBe('REQUESTED');

    const on = await agent.put(share()).send({ shared: true });
    expect(on.body).toEqual({ readReceipts: 'ON' });
  });

  it('sem o aceite do aviso que cita o recurso, a lista de pacientes não mostra o pedido', async () => {
    await (await loginAgent(PATIENT)).put(request_(psychologistLinkId)).send({ requested: true });
    await prisma.user.update({ where: { id: psychologistId }, data: { privacyVersion: '2026-11.9' } });

    const listed = (await (await loginAgent(PSYCHOLOGIST)).get('/links/patients')).body.patients[0];
    expect(listed.readReceipts).toBe('OFF');
  });

  it('a rota fica fora de /therapist/patients, que continua só leitura', async () => {
    const res = await (await loginAgent(PSYCHOLOGIST)).put(`/therapist/patients/${patientId}/read-receipts`).send({ shared: true });
    expect(res.status).toBe(403);
  });
});

describe('o que o paciente vê', () => {
  it('nada até os dois ligarem; com os dois, só as leituras em dia, com o tipo da profissional', async () => {
    const thought = await seedThought();
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    const patient = await loginAgent(PATIENT);

    // Só o paciente pediu: nada.
    await patient.put(request_(psychologistLinkId)).send({ requested: true });
    expect((await patient.get('/read-receipts')).body).toEqual({ receipts: [] });

    await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true });
    const res = await patient.get('/read-receipts');
    expect(res.status).toBe(200);
    expect(res.body.receipts).toEqual([
      { type: 'THOUGHT_RECORD', id: thought.id, readAt: expect.any(String), kind: 'PSICOLOGIA' },
    ]);
    // Nunca quem é a profissional nem ids de conta.
    expect(JSON.stringify(res.body)).not.toContain(psychologistId);
  });

  it('só a profissional que ativou aparece; as marcas da outra continuam só dela', async () => {
    const thought = await seedThought();
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await markRead(PSYCHIATRIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await turnOnForPsychologist();

    const { receipts } = (await (await loginAgent(PATIENT)).get('/read-receipts')).body;
    expect(receipts.map((receipt: { kind: string }) => receipt.kind)).toEqual(['PSICOLOGIA']);
  });

  it('desmarcar como lido, mudar o registro ou fechar a área tira a leitura da tela do paciente', async () => {
    const thought = await seedThought();
    const action = await seedAction();
    await markRead(PSYCHOLOGIST, [
      { type: 'THOUGHT_RECORD', id: thought.id },
      { type: 'ACTION', id: action.id },
    ]);
    await turnOnForPsychologist();
    const patient = await loginAgent(PATIENT);
    expect((await patient.get('/read-receipts')).body.receipts).toHaveLength(2);

    // Desmarcar: a marca some também para o paciente.
    const unmark = await (await loginAgent(PSYCHOLOGIST))
      .delete(`/therapist/read-marks/${patientId}`)
      .send({ items: [{ type: 'ACTION', id: action.id }] });
    expect(unmark.status).toBe(200);
    expect((await patient.get('/read-receipts')).body.receipts.map((r: { id: string }) => r.id)).toEqual([thought.id]);

    // Registro mudou depois da leitura (ATUALIZADO): nada até ela ler de novo.
    await prisma.thoughtRecord.update({ where: { id: thought.id }, data: { updatedAt: new Date(Date.now() + 60_000) } });
    expect((await patient.get('/read-receipts')).body.receipts).toEqual([]);

    // Área fechada para ela: a leitura não aparece, mesmo em dia.
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await prisma.thoughtRecord.update({ where: { id: thought.id }, data: { updatedAt: new Date(Date.now() - 60_000) } });
    expect((await patient.get('/read-receipts')).body.receipts).toHaveLength(1);
    await prisma.therapistLink.update({ where: { id: psychologistLinkId }, data: { sharedAreas: ['ACTIONS'] } });
    expect((await patient.get('/read-receipts')).body.receipts).toEqual([]);
  });

  it('qualquer um desliga: o paciente zera os dois lados, e a profissional pode desligar depois de ativar', async () => {
    const thought = await seedThought();
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await turnOnForPsychologist();
    const patient = await loginAgent(PATIENT);

    await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: false });
    expect((await patient.get('/read-receipts')).body.receipts).toEqual([]);

    await (await loginAgent(PSYCHOLOGIST)).put(share()).send({ shared: true });
    await patient.put(request_(psychologistLinkId)).send({ requested: false });
    expect((await patient.get('/read-receipts')).body.receipts).toEqual([]);
    const link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: psychologistLinkId } });
    expect([link.readReceiptsRequestedAt, link.readReceiptsSharedAt, link.readReceiptsNotNowAt]).toEqual([null, null, null]);

    // Um pedido novo volta a esperar a resposta dela.
    await patient.put(request_(psychologistLinkId)).send({ requested: true });
    expect((await patient.get('/read-receipts')).body.receipts).toEqual([]);
  });

  it('vínculo desfeito: as leituras somem', async () => {
    const thought = await seedThought();
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await turnOnForPsychologist();
    await prisma.therapistLink.update({ where: { id: psychologistLinkId }, data: { revokedAt: new Date() } });

    expect((await (await loginAgent(PATIENT)).get('/read-receipts')).body.receipts).toEqual([]);
  });

  it('leituras de um vínculo anterior com a mesma profissional não aparecem', async () => {
    const thought = await seedThought();
    await markRead(PSYCHOLOGIST, [{ type: 'THOUGHT_RECORD', id: thought.id }]);
    await turnOnForPsychologist();
    // Vínculo refeito depois da leitura: a marca é de antes dele.
    await prisma.therapistLink.update({ where: { id: psychologistLinkId }, data: { createdAt: new Date(Date.now() + 60_000) } });

    expect((await (await loginAgent(PATIENT)).get('/read-receipts')).body.receipts).toEqual([]);
  });

  it('o CHECK do banco barra a resposta da profissional sem pedido', async () => {
    await expect(
      prisma.therapistLink.update({ where: { id: psychiatristLinkId }, data: { readReceiptsSharedAt: new Date() } }),
    ).rejects.toThrow();
  });
});
