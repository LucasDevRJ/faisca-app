import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// "Sair de todos os aparelhos" (DEC-085): pede a senha e derruba todas as sessões da própria
// conta, e só dela. Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER = 'outra@faisca.test';
const WRONG = 'senha-errada-456';

let app: ReturnType<typeof createApp>;
let patientId: string;
let otherId: string;

beforeEach(async () => {
  await resetDatabase();
  app = createApp({ mailer: new FakeMailer() });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  otherId = (await createConfirmedUser({ name: 'Olga Fictícia', email: OTHER })).id;
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('POST /auth/logout-all', () => {
  it('com a senha: 204, apaga o cookie e todas as sessões da conta caem', async () => {
    const phone = await loginAgent(PATIENT);
    const laptop = await loginAgent(PATIENT);

    const res = await phone.post('/auth/logout-all').send({ password: PASSWORD });

    expect(res.status).toBe(204);
    expect(String(res.headers['set-cookie'])).toMatch(/faisca_session=;/);
    expect((await phone.get('/auth/me')).status).toBe(401);
    expect((await laptop.get('/auth/me')).status).toBe(401);
  });

  it('a sessão de outra pessoa continua valendo', async () => {
    const patient = await loginAgent(PATIENT);
    const other = await loginAgent(OTHER);

    expect((await patient.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(204);

    expect((await other.get('/auth/me')).status).toBe(200);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { id: otherId } });
    expect(otherUser.sessionVersion).toBe(0);
  });

  it('depois de sair de todos, entrar de novo funciona', async () => {
    const agent = await loginAgent(PATIENT);
    expect((await agent.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(204);

    const again = await loginAgent(PATIENT);
    expect((await again.get('/auth/me')).status).toBe(200);
  });

  it('senha errada: 400 e as sessões continuam', async () => {
    const phone = await loginAgent(PATIENT);
    const laptop = await loginAgent(PATIENT);

    const res = await phone.post('/auth/logout-all').send({ password: 'senha-errada-456' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect((await phone.get('/auth/me')).status).toBe(200);
    expect((await laptop.get('/auth/me')).status).toBe(200);
  });

  // A conta é sempre a da sessão: um id no corpo é recusado, não usado.
  it('sem senha ou com campo a mais: 400', async () => {
    const agent = await loginAgent(PATIENT);
    const other = await loginAgent(OTHER);

    expect((await agent.post('/auth/logout-all').send({})).status).toBe(400);
    expect((await agent.post('/auth/logout-all').send({ password: PASSWORD, userId: otherId })).status).toBe(400);
    expect((await other.get('/auth/me')).status).toBe(200);
    expect((await agent.get('/auth/me')).status).toBe(200);
  });

  it('sem sessão: 401', async () => {
    expect((await request(app).post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(401);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });
    expect(user.sessionVersion).toBe(0);
  });

  // O limite de erros de senha é um só para "Excluir conta" e "Sair de todos": trocar de rota
  // não dá tentativas novas para adivinhar a senha.
  it('erros de senha nas duas rotas somam no mesmo limite: 429', async () => {
    const agent = await loginAgent(PATIENT);
    for (let i = 0; i < 5; i++) {
      expect((await agent.post('/auth/delete-account').send({ password: 'senha-errada-456' })).status).toBe(400);
      expect((await agent.post('/auth/logout-all').send({ password: 'senha-errada-456' })).status).toBe(400);
    }

    expect((await agent.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(429);
    expect((await agent.post('/auth/delete-account').send({ password: PASSWORD })).status).toBe(429);
    expect(await prisma.user.count()).toBe(2);
  });

  // Quem roubou uma sessão e erra a senha de propósito não trava o "Sair de todos" da dona: o
  // limite de 10 é por sessão, pelo id da sessão no JWT (revisor-seguranca, DEC-085).
  it('os erros de outra sessão não bloqueiam a dona, que derruba a sessão roubada', async () => {
    // Logins no mesmo segundo: o id da sessão separa os dois mesmo com o mesmo iat.
    const thief = await loginAgent(PATIENT);
    const owner = await loginAgent(PATIENT);
    for (let i = 0; i < 10; i++) {
      expect((await thief.post('/auth/logout-all').send({ password: WRONG })).status).toBe(400);
    }
    expect((await thief.post('/auth/logout-all').send({ password: WRONG })).status).toBe(429);

    expect((await owner.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(204);
    expect((await thief.get('/auth/me')).status).toBe(401);
  });

  // Um cookie com mais de um dia é renovado a cada uso; as renovações continuam a mesma sessão no
  // limite, e não viram sessões novas com 10 tentativas cada.
  it.each([
    ['com id de sessão', { sv: 0, sid: 'sessao-roubada-ficticia' }],
    ['de antes do id de sessão', { sv: 0 }],
  ])('cookie antigo %s: as renovações somam no mesmo limite da sessão', async (_label, claims) => {
    const stolen = await oldToken(claims);
    const renewed: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${stolen}`);
      expect(res.status).toBe(200);
      renewed.push(cookieValue(res));
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    for (let i = 0; i < 10; i++) {
      const token = renewed[i % renewed.length];
      const res = await request(app).post('/auth/logout-all').set('Cookie', `${SESSION_COOKIE}=${token}`).send({ password: WRONG });
      expect(res.status).toBe(400);
    }
    const blocked = await request(app).post('/auth/logout-all').set('Cookie', `${SESSION_COOKIE}=${renewed[2]}`).send({ password: WRONG });
    expect(blocked.status).toBe(429);

    const owner = await loginAgent(PATIENT);
    expect((await owner.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(204);
    expect((await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${stolen}`)).status).toBe(401);
  }, 15_000);

  it('por conta, um teto de 30 erros somando todas as sessões', async () => {
    const sessions = [];
    for (let i = 0; i < 4; i++) sessions.push(await loginAgent(PATIENT));
    for (const agent of sessions.slice(0, 3)) {
      for (let i = 0; i < 10; i++) {
        expect((await agent.post('/auth/logout-all').send({ password: WRONG })).status).toBe(400);
      }
    }

    expect((await sessions[3]!.post('/auth/logout-all').send({ password: PASSWORD })).status).toBe(429);
    // 30 conferências de senha com bcrypt custo 12 levam um tempo.
  }, 60_000);
});

// JWT da paciente assinado há dois dias, para o requireAuth renovar a cada uso.
async function oldToken(claims: Record<string, unknown>) {
  const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(patientId)
    .setIssuedAt(twoDaysAgo)
    .setExpirationTime(twoDaysAgo + 30 * 24 * 60 * 60)
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
}

function cookieValue(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const session = cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
  expect(session).toBeDefined();
  return session!.split(';')[0]!.slice(SESSION_COOKIE.length + 1);
}
