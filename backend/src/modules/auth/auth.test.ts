import { SignJWT } from 'jose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashToken } from '../../lib/secure-token.js';
import { SESSION_COOKIE } from '../../lib/session.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';
import { PRIVACY_VERSION } from './auth.service.js';

// Dados fictícios (regra 5 do AGENTS.md).
const EMAIL = 'ana.teste@faisca.test';
const PASSWORD = 'senha-ficticia-123';
const signupBody = {
  name: 'Ana Fictícia',
  email: EMAIL,
  password: PASSWORD,
  profiles: { patient: true, therapist: false },
  acceptPrivacy: true,
};

let mailer: FakeMailer;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  await resetDatabase();
  // App novo a cada teste: mailer vazio e contadores de rate limit zerados.
  mailer = new FakeMailer();
  app = createApp({ mailer });
});

function sessionCookie(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined;
  return cookies?.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

async function loginAgent(email = EMAIL, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return agent;
}

describe('POST /auth/signup', () => {
  it('cria a conta sem confirmar e envia o link de confirmação', async () => {
    const res = await request(app).post('/auth/signup').send(signupBody);

    expect(res.status).toBe(202);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailConfirmedAt).toBeNull();
    expect(user.hasPatientProfile).toBe(true);
    expect(user.hasTherapistProfile).toBe(false);
    expect(user.passwordHash).not.toContain(PASSWORD);
    // Prova do consentimento com o aviso de privacidade (DEC-036).
    expect(user.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(user.privacyVersion).toBe(PRIVACY_VERSION);

    expect(mailer.lastTo(EMAIL)?.subject).toMatch(/confirme/i);
    expect(mailer.lastTo(EMAIL)?.text).toContain('http://localhost:5173/confirmar-email?token=');
  });

  it('sem concordar com o aviso de privacidade, não cria a conta', async () => {
    const missing = await request(app).post('/auth/signup').send({ ...signupBody, acceptPrivacy: undefined });
    const refused = await request(app).post('/auth/signup').send({ ...signupBody, acceptPrivacy: false });

    for (const res of [missing, refused]) {
      expect(res.status).toBe(400);
      expect(res.body.error.issues).toContainEqual(
        expect.objectContaining({ path: 'acceptPrivacy', message: expect.stringContaining('aviso de privacidade') }),
      );
    }
    expect(await prisma.user.count()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('guarda só o hash do token do link', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const token = mailer.lastTokenTo(EMAIL);

    const stored = await prisma.authToken.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
  });

  it('normaliza o e-mail (minúsculas, sem espaços)', async () => {
    await request(app)
      .post('/auth/signup')
      .send({ ...signupBody, email: '  Ana.Teste@FAISCA.test ' });

    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
  });

  it('com e-mail já confirmado, responde igual e só avisa o dono do e-mail', async () => {
    await createConfirmedUser({ email: EMAIL, password: 'outra-senha-ficticia' });
    const fresh = await request(app).post('/auth/signup').send({ ...signupBody, email: 'novo@faisca.test' });

    const res = await request(app).post('/auth/signup').send(signupBody);

    expect(res.status).toBe(fresh.status);
    expect(res.body).toEqual(fresh.body);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(1);
    expect(mailer.lastTo(EMAIL)?.subject).toMatch(/já tem uma conta/i);
    // A senha antiga continua valendo: o cadastro repetido não altera a conta.
    const login = await request(app).post('/auth/login').send({ email: EMAIL, password: 'outra-senha-ficticia' });
    expect(login.status).toBe(200);
  });

  it('com e-mail ainda não confirmado, reenvia a confirmação', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const firstToken = mailer.lastTokenTo(EMAIL);

    await request(app).post('/auth/signup').send(signupBody);

    expect(mailer.lastTokenTo(EMAIL)).not.toBe(firstToken);
    expect(await prisma.user.count()).toBe(1);
  });

  it('exige pelo menos um perfil', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ ...signupBody, profiles: { patient: false, therapist: false } });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('recusa senha curta sem ecoar o valor enviado', async () => {
    const res = await request(app).post('/auth/signup').send({ ...signupBody, password: 'curta' });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('curta"');
  });

  it('responde 429 a partir do 6º cadastro na mesma hora e IP', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post('/auth/signup')
        .send({ ...signupBody, email: `pessoa${i}@faisca.test` });
      expect(res.status).toBe(202);
    }
    const res = await request(app).post('/auth/signup').send(signupBody);

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});

describe('POST /auth/confirm-email', () => {
  it('confirma o e-mail e o link não vale uma segunda vez', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const token = mailer.lastTokenTo(EMAIL);

    const first = await request(app).post('/auth/confirm-email').send({ token });
    const second = await request(app).post('/auth/confirm-email').send({ token });

    expect(first.status).toBe(204);
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('INVALID_TOKEN');
    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailConfirmedAt).not.toBeNull();
  });

  it('recusa link expirado', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const token = mailer.lastTokenTo(EMAIL);
    await prisma.authToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post('/auth/confirm-email').send({ token });

    expect(res.status).toBe(400);
  });

  it('link expira em 24 horas', async () => {
    await request(app).post('/auth/signup').send(signupBody);

    const { expiresAt, createdAt } = await prisma.authToken.findFirstOrThrow();
    const hours = (expiresAt.getTime() - createdAt.getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it('recusa token inventado', async () => {
    const res = await request(app).post('/auth/confirm-email').send({ token: 'token-inventado' });

    expect(res.status).toBe(400);
  });

  it('dois cliques simultâneos no mesmo link: só um confirma', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const token = mailer.lastTokenTo(EMAIL);

    const results = await Promise.all([
      request(app).post('/auth/confirm-email').send({ token }),
      request(app).post('/auth/confirm-email').send({ token }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });
});

describe('POST /auth/resend-confirmation', () => {
  it('envia um link novo e invalida o anterior', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const oldToken = mailer.lastTokenTo(EMAIL);

    const res = await request(app).post('/auth/resend-confirmation').send({ email: EMAIL });
    const newToken = mailer.lastTokenTo(EMAIL);

    expect(res.status).toBe(204);
    expect((await request(app).post('/auth/confirm-email').send({ token: oldToken })).status).toBe(400);
    expect((await request(app).post('/auth/confirm-email').send({ token: newToken })).status).toBe(204);
  });

  it('responde 204 sem enviar nada para e-mail sem conta ou já confirmado', async () => {
    await createConfirmedUser({ email: EMAIL });

    const unknown = await request(app).post('/auth/resend-confirmation').send({ email: 'ninguem@faisca.test' });
    const confirmed = await request(app).post('/auth/resend-confirmation').send({ email: EMAIL });

    expect(unknown.status).toBe(204);
    expect(confirmed.status).toBe(204);
    expect(mailer.sent).toHaveLength(0);
  });

  it('responde 429 no 4º pedido para o mesmo e-mail na mesma hora', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth/resend-confirmation').send({ email: EMAIL });
    }
    const res = await request(app).post('/auth/resend-confirmation').send({ email: EMAIL });

    expect(res.status).toBe(429);
  });
});

describe('POST /auth/login', () => {
  it('abre a sessão em cookie httpOnly, SameSite=Lax, por 30 dias', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });

    const res = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: EMAIL, profiles: { patient: true, therapist: false } });
    expect(res.body.user).not.toHaveProperty('passwordHash');
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=2592000/);
  });

  it('senha errada e e-mail inexistente têm a mesma resposta 401', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });

    const wrongPassword = await request(app).post('/auth/login').send({ email: EMAIL, password: 'errada-123' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'ninguem@faisca.test', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(sessionCookie(wrongPassword)).toBeUndefined();
  });

  it('com e-mail não confirmado: 403 só se a senha estiver certa', async () => {
    await request(app).post('/auth/signup').send(signupBody);

    const right = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    const wrong = await request(app).post('/auth/login').send({ email: EMAIL, password: 'errada-123' });

    expect(right.status).toBe(403);
    expect(right.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
    expect(sessionCookie(right)).toBeUndefined();
    expect(wrong.status).toBe(401);
  });

  it('responde 429 depois de 10 tentativas erradas; logins certos não contam', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });

    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });
    }
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/auth/login').send({ email: EMAIL, password: 'errada-123' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD });

    expect(blocked.status).toBe(429);
  });

  it('trocar de IP não dribla o limite: 20 erros no mesmo e-mail bloqueiam (DEC-038)', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });
    // Simula quem chama a API direto e forja o X-Forwarded-For a cada tentativa.
    app.set('trust proxy', 1);
    const from = (i: number) => `203.0.113.${i + 1}`;

    for (let i = 0; i < 20; i++) {
      const res = await request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', from(i))
        .send({ email: EMAIL, password: 'errada-123' });
      expect(res.status).toBe(401);
    }
    const blocked = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', from(99))
      .send({ email: EMAIL, password: PASSWORD });
    const otherAccount = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', from(99))
      .send({ email: 'outra@faisca.test', password: 'errada-123' });

    expect(blocked.status).toBe(429);
    // O bloqueio é só daquele e-mail.
    expect(otherAccount.status).toBe(401);
  });
});

describe('GET /auth/me e POST /auth/logout', () => {
  it('sem cookie responde 401', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('com sessão válida devolve a pessoa logada', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD, therapist: true });
    const agent = await loginAgent();

    const res = await agent.get('/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: EMAIL, profiles: { patient: true, therapist: true } });
  });

  it('cookie adulterado responde 401 e é apagado', async () => {
    const res = await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=nao.e.um.jwt`);

    expect(res.status).toBe(401);
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('JWT assinado com outro segredo responde 401', async () => {
    const user = await createConfirmedUser({ email: EMAIL });
    const forged = await new SignJWT({ sv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt()
      .setExpirationTime('1d')
      .sign(new TextEncoder().encode('outro-segredo-qualquer-com-32-caracteres!'));

    const res = await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${forged}`);

    expect(res.status).toBe(401);
  });

  it('renova o cookie quando a sessão tem mais de um dia', async () => {
    const user = await createConfirmedUser({ email: EMAIL });
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const oldToken = await new SignJWT({ sv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuedAt(twoDaysAgo)
      .setExpirationTime(twoDaysAgo + 30 * 24 * 60 * 60)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));

    const res = await request(app).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${oldToken}`);

    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/Max-Age=2592000/);
  });

  it('sessão recente não gera cookie novo', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });
    const agent = await loginAgent();

    const res = await agent.get('/auth/me');

    expect(sessionCookie(res)).toBeUndefined();
  });

  it('logout apaga o cookie e /me volta a responder 401', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });
    const agent = await loginAgent();

    const logout = await agent.post('/auth/logout');
    const me = await agent.get('/auth/me');

    expect(logout.status).toBe(204);
    expect(sessionCookie(logout)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(me.status).toBe(401);
  });
});

describe('recuperação de senha', () => {
  it('e-mail sem conta: responde 204 e não envia nada', async () => {
    const res = await request(app).post('/auth/forgot-password').send({ email: 'ninguem@faisca.test' });

    expect(res.status).toBe(204);
    expect(mailer.sent).toHaveLength(0);
  });

  it('troca a senha, derruba as sessões abertas e o link vale uma vez', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });
    const oldSession = await loginAgent();

    await request(app).post('/auth/forgot-password').send({ email: EMAIL });
    const token = mailer.lastTokenTo(EMAIL);
    const reset = await request(app)
      .post('/auth/reset-password')
      .send({ token, password: 'nova-senha-ficticia' });
    const reuse = await request(app)
      .post('/auth/reset-password')
      .send({ token, password: 'mais-uma-senha-ficticia' });

    expect(reset.status).toBe(204);
    expect(reuse.status).toBe(400);
    expect((await oldSession.get('/auth/me')).status).toBe(401);
    expect((await request(app).post('/auth/login').send({ email: EMAIL, password: PASSWORD })).status).toBe(401);
    expect(
      (await request(app).post('/auth/login').send({ email: EMAIL, password: 'nova-senha-ficticia' })).status,
    ).toBe(200);
  });

  it('link de redefinição expira em 1 hora', async () => {
    await createConfirmedUser({ email: EMAIL });
    await request(app).post('/auth/forgot-password').send({ email: EMAIL });

    const { expiresAt, createdAt } = await prisma.authToken.findFirstOrThrow();
    expect((expiresAt.getTime() - createdAt.getTime()) / 3_600_000).toBeCloseTo(1, 1);
  });

  it('token de confirmação não serve para redefinir senha', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    const confirmationToken = mailer.lastTokenTo(EMAIL);

    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: confirmationToken, password: 'nova-senha-ficticia' });

    expect(res.status).toBe(400);
  });

  it('redefinir a senha também confirma o e-mail', async () => {
    await request(app).post('/auth/signup').send(signupBody);
    await request(app).post('/auth/forgot-password').send({ email: EMAIL });
    const token = mailer.lastTokenTo(EMAIL);

    await request(app).post('/auth/reset-password').send({ token, password: 'nova-senha-ficticia' });

    const user = await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailConfirmedAt).not.toBeNull();
  });

  it('nova senha passa pela mesma política do cadastro', async () => {
    await createConfirmedUser({ email: EMAIL });
    await request(app).post('/auth/forgot-password').send({ email: EMAIL });
    const token = mailer.lastTokenTo(EMAIL);

    const res = await request(app).post('/auth/reset-password').send({ token, password: 'curta' });

    expect(res.status).toBe(400);
  });

  it('responde 429 no 4º pedido para o mesmo e-mail na mesma hora', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app).post('/auth/forgot-password').send({ email: EMAIL });
    }
    const res = await request(app).post('/auth/forgot-password').send({ email: EMAIL });

    expect(res.status).toBe(429);
  });
});

describe('e-mails', () => {
  it('escapa HTML no nome da pessoa', async () => {
    await request(app)
      .post('/auth/signup')
      .send({ ...signupBody, name: '<script>alert(1)</script>' });

    const html = mailer.lastTo(EMAIL)?.html ?? '';
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('POST /auth/profiles', () => {
  it('ativa o perfil que faltava e devolve os dois', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD, patient: true, therapist: false });
    const agent = await loginAgent();

    const res = await agent.post('/auth/profiles').send({ profile: 'therapist' });

    expect(res.status).toBe(200);
    expect(res.body.user.profiles).toEqual({ patient: true, therapist: true });
    expect((await agent.get('/auth/me')).body.user.profiles).toEqual({ patient: true, therapist: true });
  });

  it('ativar um perfil que já existe não muda nada', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD, patient: true, therapist: false });

    const res = await (await loginAgent()).post('/auth/profiles').send({ profile: 'patient' });

    expect(res.status).toBe(200);
    expect(res.body.user.profiles).toEqual({ patient: true, therapist: false });
  });

  it('sem sessão: 401; perfil desconhecido: 400', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD });

    expect((await request(app).post('/auth/profiles').send({ profile: 'therapist' })).status).toBe(401);
    expect((await (await loginAgent()).post('/auth/profiles').send({ profile: 'admin' })).status).toBe(400);
  });
});

describe('POST /auth/accept-privacy (novo aceite, DEC-039)', () => {
  it('conta com a versão anterior: o /auth/me avisa e o aceite grava a data e a versão atual', async () => {
    const user = await createConfirmedUser({ email: EMAIL, password: PASSWORD, privacyVersion: '2026-10' });
    const agent = await loginAgent();
    expect((await agent.get('/auth/me')).body.user.privacyUpToDate).toBe(false);

    const res = await agent.post('/auth/accept-privacy').send({ acceptPrivacy: true });

    expect(res.status).toBe(200);
    expect(res.body.user.privacyUpToDate).toBe(true);
    expect((await agent.get('/auth/me')).body.user).toMatchObject({
      privacyUpToDate: true,
      // Um aceite só libera todas as áreas (DEC-042).
      privacyAreas: { thoughtRecords: true, tensionEpisodes: true },
    });
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.privacyVersion).toBe(PRIVACY_VERSION);
    expect(saved.privacyAcceptedAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('o /auth/me diz quais áreas a versão aceita libera (DEC-042)', async () => {
    const user = await createConfirmedUser({ email: EMAIL, password: PASSWORD, privacyVersion: null });
    const agent = await loginAgent();
    const areas = async () => (await agent.get('/auth/me')).body.user.privacyAreas;

    expect(await areas()).toEqual({ thoughtRecords: false, tensionEpisodes: false });
    for (const [version, expected] of [
      ['2026-10', { thoughtRecords: false, tensionEpisodes: false }],
      ['2026-10.2', { thoughtRecords: true, tensionEpisodes: false }],
      ['2026-10.3', { thoughtRecords: true, tensionEpisodes: true }],
      // Versão que não está na lista não libera nada.
      ['2099-01', { thoughtRecords: false, tensionEpisodes: false }],
    ] as const) {
      await prisma.user.update({ where: { id: user.id }, data: { privacyVersion: version } });
      expect(await areas(), version).toEqual(expected);
    }
  });

  it('conta de antes do aviso (sem versão) também aceita', async () => {
    await createConfirmedUser({ email: EMAIL, password: PASSWORD, privacyVersion: null });

    const res = await (await loginAgent()).post('/auth/accept-privacy').send({ acceptPrivacy: true });

    expect(res.body.user.privacyUpToDate).toBe(true);
  });

  it('sem marcar a caixa (ou com campo a mais): 400 e nada muda', async () => {
    const user = await createConfirmedUser({ email: EMAIL, password: PASSWORD, privacyVersion: '2026-10' });
    const agent = await loginAgent();

    for (const body of [{}, { acceptPrivacy: false }, { acceptPrivacy: true, privacyVersion: 'x' }]) {
      expect((await agent.post('/auth/accept-privacy').send(body)).status).toBe(400);
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).privacyVersion).toBe('2026-10');
  });

  it('sem sessão: 401', async () => {
    expect((await request(app).post('/auth/accept-privacy').send({ acceptPrivacy: true })).status).toBe(401);
  });

  it('o cadastro novo já nasce com a versão atual', async () => {
    await request(app).post('/auth/signup').send(signupBody);

    expect((await prisma.user.findUniqueOrThrow({ where: { email: EMAIL } })).privacyVersion).toBe(PRIVACY_VERSION);
  });
});
