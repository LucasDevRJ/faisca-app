import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { addDays, dateOnlyToDate, nowTimeInAppZone, timeOnlyToDate, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { futureMoment, isEditable } from './tension-episodes.service.js';

// Episódios de tensão (SPEC, "Episódios de tensão"; DEC-042).
// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER_PATIENT = 'outra-paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
// Aceitou a versão do aviso do RPD, mas não a dos episódios de tensão.
const RPD_PRIVACY = 'aviso-rpd@faisca.test';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherPatientId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ email: PATIENT })).id;
  otherPatientId = (await createConfirmedUser({ email: OTHER_PATIENT })).id;
  await createConfirmedUser({ email: THERAPIST, patient: false, therapist: true });
  await createConfirmedUser({ email: RPD_PRIVACY, privacyVersion: '2026-10.2' });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

const today = () => todayInAppZone();
const DAY_MS = 24 * 60 * 60 * 1000;

function body(overrides: Record<string, unknown> = {}) {
  return {
    episodeDate: addDays(today(), -1),
    episodeTime: '14:30',
    situation: 'Situação fictícia na fila do mercado',
    tensionLevel: 8,
    vocalizeUrge: 6,
    behavior: 'Comportamento fictício',
    consequence: 'Consequência fictícia',
    ...overrides,
  };
}

// Registro direto no banco. createdAt no passado = já passou do prazo de edição.
function seedEpisode(
  userId: string,
  {
    episodeDate = today(),
    episodeTime = null as string | null,
    createdAt = new Date(),
    situation = 'Situação fictícia',
  } = {},
) {
  return prisma.tensionEpisode.create({
    data: {
      userId,
      episodeDate: dateOnlyToDate(episodeDate),
      episodeTime: episodeTime ? timeOnlyToDate(episodeTime) : null,
      situation,
      tensionLevel: 5,
      vocalizeUrge: 4,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      createdAt,
    },
  });
}

const yesterday = () => new Date(Date.now() - DAY_MS - 60_000);

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const { id } = await seedEpisode(patientId);
    const calls = [
      request(app).get('/tension-episodes').query({ from: today(), to: today() }),
      request(app).get(`/tension-episodes/${id}`),
      request(app).post('/tension-episodes').send(body()),
      request(app).patch(`/tension-episodes/${id}`).send({ tensionLevel: 1 }),
      request(app).delete(`/tension-episodes/${id}`),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 no contexto de paciente, nada gravado', async () => {
    const { id } = await seedEpisode(patientId);
    const agent = await loginAgent(THERAPIST);

    const list = await agent.get('/tension-episodes').query({ from: today(), to: today() });
    const one = await agent.get(`/tension-episodes/${id}`);
    const create = await agent.post('/tension-episodes').send(body());

    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    expect(one.status).toBe(403);
    expect(create.status).toBe(403);
    expect(await prisma.tensionEpisode.count()).toBe(1);
  });

  it('a lista traz só os episódios da própria paciente, sem userId', async () => {
    await seedEpisode(patientId, { situation: 'Minha situação' });
    await seedEpisode(otherPatientId, { situation: 'Situação da outra' });

    const res = await (await loginAgent()).get('/tension-episodes').query({ from: today(), to: today() });

    expect(res.status).toBe(200);
    expect(res.body.tensionEpisodes.map((e: { situation: string }) => e.situation)).toEqual(['Minha situação']);
    expect(res.body.tensionEpisodes[0]).not.toHaveProperty('userId');
  });

  it('episódio de outra paciente: 403 em ler, editar e excluir, sem alterar nada', async () => {
    const theirs = await seedEpisode(otherPatientId, { situation: 'Situação da outra' });
    const agent = await loginAgent();

    const read = await agent.get(`/tension-episodes/${theirs.id}`);
    expect(read.status).toBe(403);
    expect(read.body.error.code).toBe('FORBIDDEN');
    expect(JSON.stringify(read.body)).not.toContain('Situação da outra');

    const edit = await agent.patch(`/tension-episodes/${theirs.id}`).send({ tensionLevel: 1 });
    const remove = await agent.delete(`/tension-episodes/${theirs.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(await prisma.tensionEpisode.findUniqueOrThrow({ where: { id: theirs.id } })).toEqual(theirs);
  });

  it('o userId vem da sessão: userId ou patientId no corpo é recusado', async () => {
    const agent = await loginAgent();

    const withUser = await agent.post('/tension-episodes').send(body({ userId: otherPatientId }));
    const withPatient = await agent.post('/tension-episodes').send(body({ patientId: otherPatientId }));

    expect(withUser.status).toBe(400);
    expect(withPatient.status).toBe(400);
    expect(await prisma.tensionEpisode.count()).toBe(0);
  });
});

describe('aviso de privacidade por área (DEC-042)', () => {
  it('quem só aceitou a versão do RPD: 403 nos episódios e nada gravado', async () => {
    const agent = await loginAgent(RPD_PRIVACY);

    const list = await agent.get('/tension-episodes').query({ from: today(), to: today() });
    const create = await agent.post('/tension-episodes').send(body());

    for (const res of [list, create]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PRIVACY_CONSENT_REQUIRED');
    }
    expect(await prisma.tensionEpisode.count()).toBe(0);
  });

  it('a versão nova não bloqueia de novo o RPD de quem já tinha aceitado a dele', async () => {
    const agent = await loginAgent(RPD_PRIVACY);

    expect((await agent.get('/thought-records').query({ from: today(), to: today() })).status).toBe(200);
    expect((await agent.get('/auth/me')).body.user).toMatchObject({
      privacyUpToDate: false,
      privacyAreas: { thoughtRecords: true, tensionEpisodes: false },
    });
  });

  it('depois de aceitar, os episódios liberam', async () => {
    const agent = await loginAgent(RPD_PRIVACY);
    await agent.post('/auth/accept-privacy').send({ acceptPrivacy: true });

    expect((await agent.post('/tension-episodes').send(body())).status).toBe(201);
  });
});

describe('POST /tension-episodes', () => {
  it('cria com todos os campos', async () => {
    const res = await (await loginAgent()).post('/tension-episodes').send(body());

    expect(res.status).toBe(201);
    expect(res.body.tensionEpisode).toEqual({
      id: expect.any(String),
      episodeDate: addDays(today(), -1),
      episodeTime: '14:30',
      situation: 'Situação fictícia na fila do mercado',
      tensionLevel: 8,
      vocalizeUrge: 6,
      behavior: 'Comportamento fictício',
      consequence: 'Consequência fictícia',
      editable: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it('a hora é opcional: ausente ou null fica sem horário', async () => {
    const agent = await loginAgent();
    const withoutTime: Record<string, unknown> = body();
    delete withoutTime.episodeTime;

    const absent = await agent.post('/tension-episodes').send(withoutTime);
    const asNull = await agent.post('/tension-episodes').send(body({ episodeTime: null }));

    expect(absent.status).toBe(201);
    expect(absent.body.tensionEpisode.episodeTime).toBeNull();
    expect(asNull.status).toBe(201);
    expect(asNull.body.tensionEpisode.episodeTime).toBeNull();
  });

  it('o resto é obrigatório, com notas inteiras de 0 a 10 e textos de até 1000 caracteres', async () => {
    const agent = await loginAgent();
    const invalid = [
      body({ situation: '   ' }),
      body({ behavior: undefined }),
      body({ consequence: 'x'.repeat(1001) }),
      body({ tensionLevel: 11 }),
      body({ vocalizeUrge: -1 }),
      body({ tensionLevel: 2.5 }),
      body({ episodeDate: undefined }),
      body({ episodeTime: '24:00' }),
      body({ episodeTime: '9:30' }),
      body({ episodeTime: '09:30:00' }),
    ];
    for (const payload of invalid) {
      const res = await agent.post('/tension-episodes').send(payload);
      expect(res.status, JSON.stringify(payload)).toBe(400);
    }
    expect(await prisma.tensionEpisode.count()).toBe(0);
  });

  it('dia no futuro: 400 DATE_IN_FUTURE', async () => {
    const res = await (await loginAgent()).post('/tension-episodes').send(body({ episodeDate: addDays(today(), 1) }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATE_IN_FUTURE');
  });

  // Precisa de pelo menos um minuto à frente no dia de hoje.
  it.skipIf(nowTimeInAppZone() >= '23:58')('hoje, com hora que ainda não chegou: 400 TIME_IN_FUTURE', async () => {
    const res = await (await loginAgent()).post('/tension-episodes').send(body({ episodeDate: today(), episodeTime: '23:59' }));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('TIME_IN_FUTURE');
  });
});

describe('GET /tension-episodes', () => {
  it('ordena por dia e hora; no dia, os sem hora ficam no fim, na ordem do registro', async () => {
    const day = addDays(today(), -2);
    await seedEpisode(patientId, { episodeDate: day, situation: 'Sem hora 1', createdAt: new Date(Date.now() - 3000) });
    await seedEpisode(patientId, { episodeDate: day, episodeTime: '18:00', situation: 'Às 18h' });
    await seedEpisode(patientId, { episodeDate: day, situation: 'Sem hora 2', createdAt: new Date(Date.now() - 1000) });
    await seedEpisode(patientId, { episodeDate: day, episodeTime: '08:15', situation: 'Às 8h15' });
    await seedEpisode(patientId, { episodeDate: addDays(day, -1), situation: 'Dia anterior' });

    const res = await (await loginAgent()).get('/tension-episodes').query({ from: addDays(day, -1), to: day });

    expect(res.body.tensionEpisodes.map((e: { situation: string }) => e.situation)).toEqual([
      'Dia anterior',
      'Às 8h15',
      'Às 18h',
      'Sem hora 1',
      'Sem hora 2',
    ]);
  });

  it('período de até 42 dias', async () => {
    const agent = await loginAgent();

    expect((await agent.get('/tension-episodes').query({ from: addDays(today(), -41), to: today() })).status).toBe(200);
    expect((await agent.get('/tension-episodes').query({ from: addDays(today(), -42), to: today() })).status).toBe(400);
  });

  it('GET /:id devolve o episódio; id inexistente é 404', async () => {
    const { id } = await seedEpisode(patientId, { episodeTime: '07:05' });
    const agent = await loginAgent();

    const found = await agent.get(`/tension-episodes/${id}`);
    const missing = await agent.get('/tension-episodes/00000000-0000-4000-8000-000000000000');

    expect(found.status).toBe(200);
    expect(found.body.tensionEpisode).toMatchObject({ id, episodeTime: '07:05' });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('TENSION_EPISODE_NOT_FOUND');
  });
});

describe('PATCH e DELETE /tension-episodes/:id', () => {
  it('no dia do registro: edita só o que veio, e null apaga a hora', async () => {
    const { id } = await seedEpisode(patientId, { episodeDate: addDays(today(), -1), episodeTime: '10:00' });
    const agent = await loginAgent();

    const res = await agent.patch(`/tension-episodes/${id}`).send({ vocalizeUrge: 9, episodeTime: null });

    expect(res.status).toBe(200);
    expect(res.body.tensionEpisode).toMatchObject({ vocalizeUrge: 9, tensionLevel: 5, episodeTime: null });
  });

  it('mudar só o dia para hoje confere a hora que já estava gravada', async () => {
    const { id } = await seedEpisode(patientId, { episodeDate: addDays(today(), -1), episodeTime: '23:59' });
    const agent = await loginAgent();

    const res = await agent.patch(`/tension-episodes/${id}`).send({ episodeDate: today() });

    if (nowTimeInAppZone() < '23:59') {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('TIME_IN_FUTURE');
    } else {
      expect(res.status).toBe(200);
    }
  });

  it('depois do dia do registro: 409 TENSION_EPISODE_LOCKED, sem alterar nada', async () => {
    const old = await seedEpisode(patientId, { createdAt: yesterday() });
    const agent = await loginAgent();

    const edit = await agent.patch(`/tension-episodes/${old.id}`).send({ tensionLevel: 1 });
    const remove = await agent.delete(`/tension-episodes/${old.id}`);

    for (const res of [edit, remove]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('TENSION_EPISODE_LOCKED');
    }
    expect(await prisma.tensionEpisode.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);

    const listed = await agent.get('/tension-episodes').query({ from: today(), to: today() });
    expect(listed.body.tensionEpisodes[0].editable).toBe(false);
  });

  it('exclui no dia do registro', async () => {
    const { id } = await seedEpisode(patientId);

    const res = await (await loginAgent()).delete(`/tension-episodes/${id}`);

    expect(res.status).toBe(204);
    expect(await prisma.tensionEpisode.count()).toBe(0);
  });

  it('PATCH vazio é 400', async () => {
    const { id } = await seedEpisode(patientId);

    expect((await (await loginAgent()).patch(`/tension-episodes/${id}`).send({})).status).toBe(400);
  });
});

describe('regras puras', () => {
  // 2026-10-02 15:00 em São Paulo (UTC−3).
  const now = new Date('2026-10-02T18:00:00.000Z');

  it('futureMoment: dia depois de hoje, ou hoje com hora depois de agora', () => {
    expect(futureMoment('2026-10-03', null, now)).toBe('DATE_IN_FUTURE');
    expect(futureMoment('2026-10-02', '15:01', now)).toBe('TIME_IN_FUTURE');
    expect(futureMoment('2026-10-02', '15:00', now)).toBeNull();
    expect(futureMoment('2026-10-02', null, now)).toBeNull();
    expect(futureMoment('2026-10-01', '23:59', now)).toBeNull();
  });

  it('isEditable: só no mesmo dia de São Paulo', () => {
    expect(isEditable(new Date('2026-10-02T03:00:00.000Z'), now)).toBe(true);
    expect(isEditable(new Date('2026-10-02T02:59:00.000Z'), now)).toBe(false);
  });
});

describe('exclusão da conta', () => {
  it('os episódios saem em cascata', async () => {
    await seedEpisode(patientId);
    await prisma.user.delete({ where: { id: patientId } });

    expect(await prisma.tensionEpisode.count()).toBe(0);
  });
});
