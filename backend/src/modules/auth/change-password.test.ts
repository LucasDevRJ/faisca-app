import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// "Trocar senha" com a sessão aberta (DEC-085): confere a atual, derruba os outros aparelhos e
// mantém este. Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const NEW_PASSWORD = 'senha-nova-ficticia-456';
const WRONG = 'senha-errada-456';
// Só o e-mail de senha trocada: os logins do teste também podem gerar o aviso de acesso (DEC-091).
const CHANGED_SUBJECT = 'A senha da sua conta no Faísca foi trocada';
const PATIENT = 'paciente@faisca.test';
const OTHER = 'outra@faisca.test';

let mailer: FakeMailer;
let app: ReturnType<typeof createApp>;
let patientId: string;
let otherId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  otherId = (await createConfirmedUser({ name: 'Olga Fictícia', email: OTHER })).id;
});

async function loginAgent(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('POST /auth/change-password', () => {
  it('troca a senha: este aparelho continua, o outro sai e só a nova senha entra', async () => {
    const phone = await loginAgent(PATIENT);
    const laptop = await loginAgent(PATIENT);

    const res = await phone.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    expect((await phone.get('/auth/me')).status).toBe(200);
    expect((await laptop.get('/auth/me')).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })).status).toBe(401);
    await loginAgent(PATIENT, NEW_PASSWORD);
  });

  // Sessão com mais de um dia: o requireAuth renova o cookie no mesmo pedido, com o sessionVersion
  // de antes. Só o cookie novo pode ir na resposta, senão este aparelho sairia da conta.
  it('numa sessão que é renovada no mesmo pedido, este aparelho continua', async () => {
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const old = await new SignJWT({ sv: 0, sid: 'sessao-antiga-ficticia' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(patientId)
      .setIssuedAt(twoDaysAgo)
      .setExpirationTime(twoDaysAgo + 30 * 24 * 60 * 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const res = await request(app)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${old}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(204);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []).filter((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(cookies).toHaveLength(1);
    const token = cookies[0]!.split(';')[0]!.slice(SESSION_COOKIE.length + 1);
    expect((await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${token}`)).status).toBe(200);
    expect((await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${old}`)).status).toBe(401);
  });

  it('um link de "Esqueci a senha" pedido antes deixa de valer', async () => {
    await request(app).post('/auth/forgot-password').send({ email: PATIENT });
    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)).toBeDefined());
    const token = mailer.lastTokenTo(PATIENT);
    const agent = await loginAgent(PATIENT);
    expect((await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(204);

    const reset = await request(app).post('/auth/reset-password').send({ token, password: 'outra-senha-ficticia-789' });

    expect(reset.status).toBe(400);
    await loginAgent(PATIENT, NEW_PASSWORD);
  });

  it('manda um e-mail neutro, sem link', async () => {
    const agent = await loginAgent(PATIENT);
    await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    const email = mailer.lastTo(PATIENT)!;
    expect(email.to).toBe(PATIENT);
    expect(email.subject).toBe('A senha da sua conta no Faísca foi trocada');
    expect(email.text).toContain('Esqueci minha senha');
    expect(email.text).not.toMatch(/https?:\/\//);
    expect(email.html).not.toMatch(/<a\s/);
    expect(email.text).not.toContain(NEW_PASSWORD);
  });

  it('senha atual errada: 400, nada muda e nenhum e-mail', async () => {
    const phone = await loginAgent(PATIENT);
    const laptop = await loginAgent(PATIENT);

    const res = await phone.post('/auth/change-password').send({ currentPassword: WRONG, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect((await laptop.get('/auth/me')).status).toBe(200);
    await loginAgent(PATIENT, PASSWORD);
    expect(mailer.sent.filter((m) => m.subject === CHANGED_SUBJECT)).toHaveLength(0);
  });

  it('nova senha igual à atual: 400', async () => {
    const agent = await loginAgent(PATIENT);

    const res = await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SAME_PASSWORD');
    expect(mailer.sent.filter((m) => m.subject === CHANGED_SUBJECT)).toHaveLength(0);
  });

  it('nova senha curta, campo faltando ou a mais: 400', async () => {
    const agent = await loginAgent(PATIENT);

    expect((await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: 'curta' })).status).toBe(400);
    expect((await agent.post('/auth/change-password').send({ newPassword: NEW_PASSWORD })).status).toBe(400);
    expect(
      (await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, userId: otherId }))
        .status,
    ).toBe(400);
    await loginAgent(PATIENT, PASSWORD);
  });

  it('só muda a própria conta: a outra pessoa segue com a senha e a sessão dela', async () => {
    const other = await loginAgent(OTHER);
    const agent = await loginAgent(PATIENT);
    await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect((await other.get('/auth/me')).status).toBe(200);
    await loginAgent(OTHER, PASSWORD);
    const otherUser = await prisma.user.findUniqueOrThrow({ where: { id: otherId } });
    expect(otherUser.sessionVersion).toBe(0);
  });

  it('sem sessão: 401', async () => {
    const res = await request(app).post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(401);
    await loginAgent(PATIENT, PASSWORD);
  });

  // Os erros de senha atual somam no mesmo limite de "Excluir conta" e "Sair de todos".
  it('erros nas três rotas somam no mesmo limite da sessão: 429', async () => {
    const agent = await loginAgent(PATIENT);
    for (let i = 0; i < 4; i++) {
      expect((await agent.post('/auth/change-password').send({ currentPassword: WRONG, newPassword: NEW_PASSWORD })).status).toBe(400);
      expect((await agent.post('/auth/logout-all').send({ password: WRONG })).status).toBe(400);
    }
    expect((await agent.post('/auth/delete-account').send({ password: WRONG })).status).toBe(400);
    expect((await agent.post('/auth/delete-account').send({ password: WRONG })).status).toBe(400);

    const res = await agent.post('/auth/change-password').send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(res.status).toBe(429);
  }, 30_000);
});
