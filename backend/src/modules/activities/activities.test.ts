import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import type { ActivityStatus } from '../../generated/prisma/client.js';
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

// Cria direto no banco, para testar um estado sem depender das outras rotas.
async function seedActivity(
  userId: string,
  status: ActivityStatus = 'PLANEJADA',
  activityDate = today(),
) {
  const scores = {
    PLANEJADA: {},
    PENDENTE: { wantBefore: 4 },
    CONCLUIDA: { wantBefore: 4, pleasure: 7, achievement: 8 },
    NAO_REALIZADA: {},
  }[status];
  return prisma.activity.create({
    data: {
      userId,
      name: 'Caminhada fictícia',
      activityDate: dateOnlyToDate(activityDate),
      status,
      ...scores,
    },
  });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const id = (await seedActivity(patientId)).id;
    const calls = [
      request(app).get(`/activities?from=${today()}&to=${today()}`),
      request(app).post('/activities').send({}),
      request(app).patch(`/activities/${id}`).send({ name: 'x' }),
      request(app).delete(`/activities/${id}`),
      request(app).post(`/activities/${id}/start`).send({ wantBefore: 1 }),
      request(app).post(`/activities/${id}/complete`).send({}),
      request(app).post(`/activities/${id}/not-done`).send({}),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente', async () => {
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get(`/activities?from=${today()}&to=${today()}`);
    const create = await agent
      .post('/activities')
      .send({ status: 'PLANEJADA', name: 'Leitura', activityDate: today() });

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(create.status).toBe(403);
    expect(await prisma.activity.count()).toBe(0);
  });

  it('a lista traz só as atividades da própria paciente', async () => {
    await seedActivity(patientId);
    await seedActivity(otherPatientId);
    const agent = await loginAgent();

    const res = await agent.get(`/activities?from=${today()}&to=${today()}`);

    expect(res.status).toBe(200);
    expect(res.body.activities).toHaveLength(1);
    expect(res.body.activities[0]).not.toHaveProperty('userId');
  });

  it('atividade de outra paciente: 403 em editar, transicionar e excluir, sem alterar nada', async () => {
    const theirs = await seedActivity(otherPatientId, 'PENDENTE');
    const agent = await loginAgent();

    const calls = [
      agent.patch(`/activities/${theirs.id}`).send({ name: 'Invadido' }),
      agent.post(`/activities/${theirs.id}/start`).send({ wantBefore: 1 }),
      agent.post(`/activities/${theirs.id}/complete`).send({ pleasure: 1, achievement: 1 }),
      agent.post(`/activities/${theirs.id}/not-done`).send({}),
      agent.delete(`/activities/${theirs.id}`),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.activity.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('o userId vem da sessão: um userId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/activities').send({
      status: 'PLANEJADA',
      name: 'Leitura',
      activityDate: today(),
      userId: otherPatientId,
    });

    expect(res.status).toBe(400);
    expect(await prisma.activity.count({ where: { userId: otherPatientId } })).toBe(0);
  });
});

describe('POST /activities', () => {
  it('cria PLANEJADA', async () => {
    const agent = await loginAgent();

    const res = await agent
      .post('/activities')
      .send({ status: 'PLANEJADA', name: '  Ligar para uma amiga  ', activityDate: addDays(today(), 3) });

    expect(res.status).toBe(201);
    expect(res.body.activity).toMatchObject({
      name: 'Ligar para uma amiga',
      activityDate: addDays(today(), 3),
      status: 'PLANEJADA',
      wantBefore: null,
      pleasure: null,
      achievement: null,
      observation: null,
    });
  });

  it('cria PENDENTE com a vontade', async () => {
    const agent = await loginAgent();

    const res = await agent
      .post('/activities')
      .send({ status: 'PENDENTE', name: 'Cozinhar', activityDate: today(), wantBefore: 3 });

    expect(res.status).toBe(201);
    expect(res.body.activity).toMatchObject({ status: 'PENDENTE', wantBefore: 3 });
  });

  it('cria CONCLUIDA retroativa (dia anterior), guardando quando foi registrada', async () => {
    const agent = await loginAgent();
    const yesterday = addDays(today(), -1);

    const res = await agent.post('/activities').send({
      status: 'CONCLUIDA',
      name: 'Caminhada no parque',
      activityDate: yesterday,
      wantBefore: 2,
      pleasure: 7,
      achievement: 8,
      observation: '   ',
    });

    expect(res.status).toBe(201);
    expect(res.body.activity).toMatchObject({
      status: 'CONCLUIDA',
      activityDate: yesterday,
      wantBefore: 2,
      pleasure: 7,
      achievement: 8,
      observation: null,
    });
    expect(Date.parse(res.body.activity.createdAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('recusa CONCLUIDA com data futura', async () => {
    const agent = await loginAgent();

    const res = await agent.post('/activities').send({
      status: 'CONCLUIDA',
      name: 'Caminhada',
      activityDate: addDays(today(), 1),
      wantBefore: 2,
      pleasure: 7,
      achievement: 8,
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATE_IN_FUTURE');
  });

  it.each([
    ['NAO_REALIZADA não pode ser criada direto', { status: 'NAO_REALIZADA', name: 'x', activityDate: '2026-09-01' }],
    ['PENDENTE sem vontade', { status: 'PENDENTE', name: 'x', activityDate: '2026-09-01' }],
    ['CONCLUIDA sem prazer', { status: 'CONCLUIDA', name: 'x', activityDate: '2026-09-01', wantBefore: 1, achievement: 1 }],
    ['nota acima de 10', { status: 'PENDENTE', name: 'x', activityDate: '2026-09-01', wantBefore: 11 }],
    ['nota quebrada', { status: 'PENDENTE', name: 'x', activityDate: '2026-09-01', wantBefore: 5.5 }],
    ['prazer numa PLANEJADA', { status: 'PLANEJADA', name: 'x', activityDate: '2026-09-01', pleasure: 5 }],
    ['nome vazio', { status: 'PLANEJADA', name: '   ', activityDate: '2026-09-01' }],
    ['nome longo', { status: 'PLANEJADA', name: 'a'.repeat(101), activityDate: '2026-09-01' }],
    ['data inválida', { status: 'PLANEJADA', name: 'x', activityDate: '2026-02-30' }],
    [
      'observação longa',
      {
        status: 'CONCLUIDA',
        name: 'x',
        activityDate: '2026-09-01',
        wantBefore: 1,
        pleasure: 1,
        achievement: 1,
        observation: 'a'.repeat(1001),
      },
    ],
  ])('400: %s', async (_label, body) => {
    const agent = await loginAgent();

    const res = await agent.post('/activities').send(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.activity.count()).toBe(0);
  });

  it('várias atividades no mesmo dia', async () => {
    const agent = await loginAgent();
    for (const name of ['Primeira', 'Segunda']) {
      const res = await agent.post('/activities').send({ status: 'PLANEJADA', name, activityDate: today() });
      expect(res.status).toBe(201);
    }
    expect(await prisma.activity.count({ where: { userId: patientId } })).toBe(2);
  });
});

describe('GET /activities', () => {
  it('filtra pelo intervalo e ordena por dia e depois por registro', async () => {
    const monday = '2026-09-21';
    const second = await seedActivity(patientId, 'PLANEJADA', '2026-09-23');
    const first = await seedActivity(patientId, 'PLANEJADA', monday);
    const third = await seedActivity(patientId, 'PLANEJADA', '2026-09-23');
    await seedActivity(patientId, 'PLANEJADA', '2026-09-28'); // semana seguinte
    await seedActivity(patientId, 'PLANEJADA', '2026-09-20'); // semana anterior
    const agent = await loginAgent();

    const res = await agent.get('/activities?from=2026-09-21&to=2026-09-27');

    expect(res.status).toBe(200);
    expect(res.body.activities.map((a: { id: string }) => a.id)).toEqual([first.id, second.id, third.id]);
  });

  it.each([
    ['sem datas', ''],
    ['fim antes do início', '?from=2026-09-27&to=2026-09-21'],
    ['mais de 42 dias', '?from=2026-09-01&to=2026-10-13'],
  ])('400: %s', async (_label, query) => {
    const agent = await loginAgent();

    const res = await agent.get(`/activities${query}`);

    expect(res.status).toBe(400);
  });

  it('aceita exatamente 42 dias (de 1º/9 a 12/10, contando as pontas)', async () => {
    const agent = await loginAgent();

    const res = await agent.get('/activities?from=2026-09-01&to=2026-10-12');

    expect(res.status).toBe(200);
  });
});

describe('PATCH /activities/:id', () => {
  it('edita nome e data de uma PLANEJADA', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent();

    const res = await agent
      .patch(`/activities/${activity.id}`)
      .send({ name: 'Novo nome', activityDate: addDays(today(), 2) });

    expect(res.status).toBe(200);
    expect(res.body.activity).toMatchObject({ name: 'Novo nome', activityDate: addDays(today(), 2) });
  });

  it('edita a vontade de uma PENDENTE', async () => {
    const activity = await seedActivity(patientId, 'PENDENTE');
    const agent = await loginAgent();

    const res = await agent.patch(`/activities/${activity.id}`).send({ wantBefore: 9 });

    expect(res.status).toBe(200);
    expect(res.body.activity.wantBefore).toBe(9);
  });

  it('vontade numa PLANEJADA: 409, porque isso é a transição start', async () => {
    const activity = await seedActivity(patientId);
    const agent = await loginAgent();

    const res = await agent.patch(`/activities/${activity.id}`).send({ wantBefore: 5 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('corpo vazio ou com campo de outro estado: 400', async () => {
    const activity = await seedActivity(patientId, 'PENDENTE');
    const agent = await loginAgent();

    expect((await agent.patch(`/activities/${activity.id}`).send({})).status).toBe(400);
    expect((await agent.patch(`/activities/${activity.id}`).send({ status: 'CONCLUIDA' })).status).toBe(400);
    expect((await agent.patch(`/activities/${activity.id}`).send({ pleasure: 5 })).status).toBe(400);
  });

  it('id que não existe: 404; id malformado: 400', async () => {
    const agent = await loginAgent();

    const missing = await agent
      .patch('/activities/00000000-0000-4000-8000-000000000000')
      .send({ name: 'x' });
    const malformed = await agent.patch('/activities/nao-e-uuid').send({ name: 'x' });

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(400);
  });
});

describe('transições', () => {
  it('PLANEJADA → PENDENTE → CONCLUIDA', async () => {
    const activity = await seedActivity(patientId, 'PLANEJADA', addDays(today(), -2));
    const agent = await loginAgent();

    const start = await agent.post(`/activities/${activity.id}/start`).send({ wantBefore: 3 });
    const complete = await agent
      .post(`/activities/${activity.id}/complete`)
      .send({ pleasure: 6, achievement: 9, observation: 'Foi melhor do que eu esperava.' });

    expect(start.status).toBe(200);
    expect(start.body.activity).toMatchObject({ status: 'PENDENTE', wantBefore: 3 });
    expect(complete.status).toBe(200);
    expect(complete.body.activity).toMatchObject({
      status: 'CONCLUIDA',
      wantBefore: 3,
      pleasure: 6,
      achievement: 9,
      observation: 'Foi melhor do que eu esperava.',
    });
  });

  it.each(['PLANEJADA', 'PENDENTE'] as const)('%s → NAO_REALIZADA, com ou sem corpo', async (status) => {
    const withObs = await seedActivity(patientId, status);
    const withoutBody = await seedActivity(patientId, status);
    const agent = await loginAgent();

    const a = await agent.post(`/activities/${withObs.id}/not-done`).send({ observation: 'Choveu.' });
    const b = await agent.post(`/activities/${withoutBody.id}/not-done`);

    expect(a.status).toBe(200);
    expect(a.body.activity).toMatchObject({ status: 'NAO_REALIZADA', observation: 'Choveu.' });
    expect(b.status).toBe(200);
    expect(b.body.activity).toMatchObject({ status: 'NAO_REALIZADA', observation: null });
  });

  it('PLANEJADA não vai direto para CONCLUIDA; PENDENTE não volta para start', async () => {
    const planned = await seedActivity(patientId, 'PLANEJADA');
    const pending = await seedActivity(patientId, 'PENDENTE');
    const agent = await loginAgent();

    const complete = await agent.post(`/activities/${planned.id}/complete`).send({ pleasure: 1, achievement: 1 });
    const start = await agent.post(`/activities/${pending.id}/start`).send({ wantBefore: 1 });

    expect(complete.status).toBe(409);
    expect(complete.body.error.code).toBe('INVALID_TRANSITION');
    expect(start.status).toBe(409);
    expect(start.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('não conclui nem marca "não aconteceu" num dia que ainda não chegou', async () => {
    const pending = await seedActivity(patientId, 'PENDENTE', addDays(today(), 1));
    const agent = await loginAgent();

    const complete = await agent.post(`/activities/${pending.id}/complete`).send({ pleasure: 5, achievement: 5 });
    const notDone = await agent.post(`/activities/${pending.id}/not-done`);
    // Registrar a vontade antes do dia continua valendo.
    const planned = await seedActivity(patientId, 'PLANEJADA', addDays(today(), 1));
    const start = await agent.post(`/activities/${planned.id}/start`).send({ wantBefore: 5 });

    expect(complete.status).toBe(409);
    expect(complete.body.error.code).toBe('DATE_IN_FUTURE');
    expect(notDone.status).toBe(409);
    expect(start.status).toBe(200);
  });
});

describe('registros finais são imutáveis (regra 2)', () => {
  it.each(['CONCLUIDA', 'NAO_REALIZADA'] as const)(
    '%s: editar, excluir e transicionar dão 409 e nada muda',
    async (status) => {
      const activity = await seedActivity(patientId, status);
      const agent = await loginAgent();

      const calls = [
        agent.patch(`/activities/${activity.id}`).send({ name: 'Outro nome' }),
        agent.delete(`/activities/${activity.id}`),
        agent.post(`/activities/${activity.id}/start`).send({ wantBefore: 1 }),
        agent.post(`/activities/${activity.id}/complete`).send({ pleasure: 1, achievement: 1 }),
        agent.post(`/activities/${activity.id}/not-done`).send({}),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ACTIVITY_FINALIZED');
      }
      expect(await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } })).toEqual(activity);
    },
  );

  it('duas conclusões ao mesmo tempo: só uma grava, a outra recebe 409', async () => {
    const activity = await seedActivity(patientId, 'PENDENTE');
    const agent = await loginAgent();

    const results = await Promise.all([
      agent.post(`/activities/${activity.id}/complete`).send({ pleasure: 1, achievement: 1 }),
      agent.post(`/activities/${activity.id}/complete`).send({ pleasure: 9, achievement: 9 }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = await prisma.activity.findUniqueOrThrow({ where: { id: activity.id } });
    const winner = results.find((r) => r.status === 200)!.body.activity;
    expect(saved.pleasure).toBe(winner.pleasure);
  });
});

describe('DELETE /activities/:id', () => {
  it.each(['PLANEJADA', 'PENDENTE'] as const)('exclui uma %s', async (status) => {
    const activity = await seedActivity(patientId, status);
    const agent = await loginAgent();

    const res = await agent.delete(`/activities/${activity.id}`);

    expect(res.status).toBe(204);
    expect(await prisma.activity.findUnique({ where: { id: activity.id } })).toBeNull();
  });
});

describe('CHECKs do banco (segunda linha de defesa)', () => {
  it('recusa CONCLUIDA sem notas mesmo fora da API', async () => {
    await expect(
      prisma.activity.create({
        data: { userId: patientId, name: 'x', activityDate: new Date(), status: 'CONCLUIDA' },
      }),
    ).rejects.toThrow();
  });

  it('recusa nota fora de 0 a 10 e observação numa PENDENTE', async () => {
    await expect(
      prisma.activity.create({
        data: { userId: patientId, name: 'x', activityDate: new Date(), status: 'PENDENTE', wantBefore: 11 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.activity.create({
        data: {
          userId: patientId,
          name: 'x',
          activityDate: new Date(),
          status: 'PENDENTE',
          wantBefore: 5,
          observation: 'não pode',
        },
      }),
    ).rejects.toThrow();
  });

  it('excluir a conta apaga as atividades (LGPD)', async () => {
    await seedActivity(patientId, 'CONCLUIDA');

    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.activity.count({ where: { userId: patientId } })).toBe(0);
  });
});
