import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { planDateError, recordDateError } from './actions.service.js';

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
  // Aceitou o aviso antes da Ação (DEC-051).
  await createConfirmedUser({ email: OLD_CONSENT, privacyVersion: '2026-10.4' });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const day = (offset: number) => addDays(today(), offset);
const range = () => ({ from: day(-10), to: day(10) });

const planned = (overrides: Record<string, unknown> = {}) => ({
  status: 'PLANEJADA',
  actionDate: day(2),
  name: 'Cinema com amigos',
  category: 'CONEXAO',
  expectation: 4,
  ...overrides,
});

type SeedOverrides = { actionDate?: Date; name?: string; category?: 'PRAZER' | 'CONEXAO' | 'REALIZACAO' };

function seedAction(userId: string, overrides: SeedOverrides = {}) {
  return prisma.behavioralAction.create({
    data: {
      userId,
      actionDate: dateOnlyToDate(today()),
      name: 'Ação fictícia',
      category: 'PRAZER',
      expectation: 3,
      ...overrides,
    },
  });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const { id } = await seedAction(patientId);
    const calls = [
      request(app).get('/actions').query(range()),
      request(app).get(`/actions/${id}`),
      request(app).post('/actions').send(planned()),
      request(app).patch(`/actions/${id}`).send({ name: 'x' }),
      request(app).post(`/actions/${id}/evaluate`).send({ pleasure: 5, achievement: 5 }),
      request(app).post(`/actions/${id}/not-done`).send({}),
      request(app).delete(`/actions/${id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente, nada gravado', async () => {
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get('/actions').query(range());
    const create = await agent.post('/actions').send(planned());

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(create.status).toBe(403);
    expect(await prisma.behavioralAction.count()).toBe(0);
  });

  it('a lista traz só as ações da própria paciente, sem userId', async () => {
    await seedAction(patientId, { name: 'Minha ação' });
    await seedAction(otherPatientId, { name: 'Ação da outra' });
    const agent = await loginAgent();

    const res = await agent.get('/actions').query(range());

    expect(res.status).toBe(200);
    expect(res.body.actions.map((a: { name: string }) => a.name)).toEqual(['Minha ação']);
    expect(res.body.actions[0]).not.toHaveProperty('userId');
  });

  it('ação de outra paciente: 403 em ler, editar, avaliar e excluir, sem alterar nada', async () => {
    const theirs = await seedAction(otherPatientId);
    const agent = await loginAgent();

    const calls = [
      agent.get(`/actions/${theirs.id}`),
      agent.patch(`/actions/${theirs.id}`).send({ name: 'Mudado' }),
      agent.post(`/actions/${theirs.id}/evaluate`).send({ pleasure: 5, achievement: 5 }),
      agent.post(`/actions/${theirs.id}/not-done`).send({}),
      agent.delete(`/actions/${theirs.id}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.behavioralAction.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('o userId vem da sessão: userId ou patientId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const withUser = await agent.post('/actions').send(planned({ userId: otherPatientId }));
    const withPatient = await agent.post('/actions').send(planned({ patientId: otherPatientId }));

    expect(withUser.status).toBe(400);
    expect(withPatient.status).toBe(400);
    expect(await prisma.behavioralAction.count()).toBe(0);
  });
});

describe('aceite do aviso (DEC-051)', () => {
  it('sem a versão 2026-10.5: a área fica bloqueada, e o resto não', async () => {
    const agent = await loginAgent(OLD_CONSENT);

    const res = await agent.get('/actions').query(range());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    expect((await agent.get('/appointments')).status).toBe(200);
  });
});

describe('planejar e registrar', () => {
  it('planeja com a expectativa: começa PLANEJADA, sem prazer nem realização', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/actions').send(planned({ name: '  Cinema com amigos  ' }));

    expect(res.status).toBe(201);
    expect(res.body.action).toEqual(
      expect.objectContaining({
        actionDate: day(2),
        name: 'Cinema com amigos',
        category: 'CONEXAO',
        status: 'PLANEJADA',
        expectation: 4,
        pleasure: null,
        achievement: null,
        observation: null,
      }),
    );
  });

  it('registra algo que já foi feito, já avaliado', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/actions').send({
      status: 'AVALIADA',
      actionDate: day(-3),
      name: 'Arrumar a estante',
      category: 'REALIZACAO',
      expectation: 2,
      pleasure: 6,
      achievement: 9,
      observation: 'Ficou ótimo',
    });

    expect(res.status).toBe(201);
    expect(res.body.action).toEqual(
      expect.objectContaining({ status: 'AVALIADA', pleasure: 6, achievement: 9, observation: 'Ficou ótimo' }),
    );
  });

  it('janelas de data: planejar de hoje a +7; registrar de -7 a hoje', async () => {
    const agent = await loginAgent();
    const done = { status: 'AVALIADA', name: 'x', category: 'PRAZER', expectation: 1, pleasure: 1, achievement: 1 };

    const results = await Promise.all([
      agent.post('/actions').send(planned({ actionDate: day(0) })),
      agent.post('/actions').send(planned({ actionDate: day(7) })),
      agent.post('/actions').send(planned({ actionDate: day(8) })),
      agent.post('/actions').send(planned({ actionDate: day(-1) })),
      agent.post('/actions').send({ ...done, actionDate: day(-7) }),
      agent.post('/actions').send({ ...done, actionDate: day(-8) }),
      agent.post('/actions').send({ ...done, actionDate: day(1) }),
    ]);

    expect(results.map((r) => r.status)).toEqual([201, 201, 400, 400, 201, 400, 400]);
    expect(results[2]!.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it.each([
    ['sem categoria', { category: undefined }],
    ['categoria inválida', { category: 'OUTRA' }],
    ['sem expectativa', { expectation: undefined }],
    ['nota fora de 0 a 10', { expectation: 11 }],
    ['nome vazio', { name: '   ' }],
    ['nome longo', { name: 'x'.repeat(101) }],
    ['planejada com prazer', { pleasure: 5 }],
  ])('400: %s', async (_label, overrides) => {
    const agent = await loginAgent();

    const res = await agent.post('/actions').send(planned(overrides));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('avaliar, não realizada, editar e excluir', () => {
  it('avaliar: prazer e realização, observação opcional; vira final', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent();

    const res = await agent.post(`/actions/${action.id}/evaluate`).send({ pleasure: 7, achievement: 8 });
    const again = await agent.post(`/actions/${action.id}/evaluate`).send({ pleasure: 1, achievement: 1 });
    const edit = await agent.patch(`/actions/${action.id}`).send({ name: 'Mudado' });
    const remove = await agent.delete(`/actions/${action.id}`);

    expect(res.status).toBe(200);
    expect(res.body.action).toEqual(expect.objectContaining({ status: 'AVALIADA', pleasure: 7, achievement: 8 }));
    for (const r of [again, edit, remove]) {
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('ACTION_FINALIZED');
    }
  });

  it('não realizada: continua registrada, com observação opcional, e é final', async () => {
    const action = await seedAction(patientId, { actionDate: dateOnlyToDate(day(-2)) });
    const agent = await loginAgent();

    const res = await agent.post(`/actions/${action.id}/not-done`).send({ observation: 'Choveu, fica para a próxima.' });
    const list = await agent.get('/actions').query(range());
    const edit = await agent.patch(`/actions/${action.id}`).send({ name: 'Mudado' });

    expect(res.body.action).toEqual(
      expect.objectContaining({ status: 'NAO_REALIZADA', observation: 'Choveu, fica para a próxima.' }),
    );
    expect(list.body.actions).toHaveLength(1);
    expect(edit.status).toBe(409);
  });

  it('avaliar ou marcar não realizada só a partir do dia da ação', async () => {
    const action = await seedAction(patientId, { actionDate: dateOnlyToDate(day(3)) });
    const agent = await loginAgent();

    const evaluate = await agent.post(`/actions/${action.id}/evaluate`).send({ pleasure: 5, achievement: 5 });
    const notDone = await agent.post(`/actions/${action.id}/not-done`).send({});

    for (const r of [evaluate, notDone]) {
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('ACTION_NOT_YET');
    }
  });

  it('pendente com o dia já passado (até além dos 7 dias) ainda pode ser avaliada', async () => {
    const action = await seedAction(patientId, { actionDate: dateOnlyToDate(day(-20)) });
    const agent = await loginAgent();

    const res = await agent.post(`/actions/${action.id}/evaluate`).send({ pleasure: 4, achievement: 6 });

    expect(res.status).toBe(200);
  });

  it('editar a planejada: o que mudou; mudar o dia segue a janela de planejar', async () => {
    const action = await seedAction(patientId, { actionDate: dateOnlyToDate(day(-2)) });
    const agent = await loginAgent();

    // O dia já passou, mas mudar só o nome vale.
    const rename = await agent.patch(`/actions/${action.id}`).send({ name: 'Novo nome', category: 'REALIZACAO' });
    const past = await agent.patch(`/actions/${action.id}`).send({ actionDate: day(-1) });
    const ahead = await agent.patch(`/actions/${action.id}`).send({ actionDate: day(4) });

    expect(rename.body.action).toEqual(expect.objectContaining({ name: 'Novo nome', category: 'REALIZACAO' }));
    expect(past.status).toBe(400);
    expect(ahead.body.action.actionDate).toBe(day(4));
  });

  it('excluir a planejada; id que não existe é 404 e malformado é 400', async () => {
    const action = await seedAction(patientId);
    const agent = await loginAgent();

    const res = await agent.delete(`/actions/${action.id}`);
    const missing = await agent.delete(`/actions/${action.id}`);
    const malformed = await agent.get('/actions/nao-e-uuid');

    expect(res.status).toBe(204);
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });

  it('excluir a conta apaga as ações (LGPD)', async () => {
    await seedAction(patientId);

    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.behavioralAction.count({ where: { userId: patientId } })).toBe(0);
  });
});

describe('janelas de data (funções puras)', () => {
  it('planejar: hoje até +7', () => {
    expect(planDateError('2026-10-04', '2026-10-04')).toBeNull();
    expect(planDateError('2026-10-11', '2026-10-04')).toBeNull();
    expect(planDateError('2026-10-12', '2026-10-04')).not.toBeNull();
    expect(planDateError('2026-10-03', '2026-10-04')).not.toBeNull();
  });

  it('registrar o que já foi feito: -7 até hoje', () => {
    expect(recordDateError('2026-09-27', '2026-10-04')).toBeNull();
    expect(recordDateError('2026-09-26', '2026-10-04')).not.toBeNull();
    expect(recordDateError('2026-10-05', '2026-10-04')).not.toBeNull();
  });
});
