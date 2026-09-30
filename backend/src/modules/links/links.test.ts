import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { hashLinkCode } from '../../lib/link-code.js';
import { prisma } from '../../lib/prisma.js';
import { hashToken } from '../../lib/secure-token.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Dados fictícios (regra 5 do AGENTS.md).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const THERAPIST = 'terapeuta@faisca.test';
const OTHER_THERAPIST = 'outra-terapeuta@faisca.test';
const BOTH = 'dois-perfis@faisca.test';

let mailer: FakeMailer;
let app: ReturnType<typeof createApp>;
let patientId: string;
let therapistId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  therapistId = (
    await createConfirmedUser({ name: 'Tereza Fictícia', email: THERAPIST, patient: false, therapist: true })
  ).id;
  await createConfirmedUser({ name: 'Olga Fictícia', email: OTHER_THERAPIST, patient: false, therapist: true });
  await createConfirmedUser({ name: 'Duda Fictícia', email: BOTH, patient: true, therapist: true });
});

async function loginAgent(email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

async function generateCode(email = PATIENT): Promise<string> {
  const res = await (await loginAgent(email)).post('/link/code');
  expect(res.status).toBe(201);
  return res.body.code as string;
}

async function sendInvite(to = THERAPIST, from = PATIENT): Promise<string> {
  const res = await (await loginAgent(from)).post('/link/invite').send({ email: to });
  expect(res.status).toBe(201);
  return mailer.lastTokenTo(to);
}

function activeLinks() {
  return prisma.therapistLink.findMany({ where: { revokedAt: null } });
}

describe('autorização (regra 1)', () => {
  it('sem sessão: 401 em todas as rotas', async () => {
    const calls = [
      request(app).get('/link'),
      request(app).post('/link/invite').send({ email: THERAPIST }),
      request(app).delete('/link/invite'),
      request(app).post('/link/code'),
      request(app).post('/link/revoke'),
      request(app).post('/link/seen'),
      request(app).post('/links/redeem-code').send({ code: 'K7M4-P9QX' }),
      request(app).post('/links/accept-invite').send({ token: 'qualquer' }),
      request(app).get('/links/patients'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
  });

  it('conta só de terapeuta: 403 nas rotas do paciente, sem criar nada', async () => {
    const agent = await loginAgent(THERAPIST);

    for (const res of [
      await agent.get('/link'),
      await agent.post('/link/code'),
      await agent.post('/link/invite').send({ email: OTHER_THERAPIST }),
      await agent.post('/link/revoke'),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PATIENT_PROFILE_REQUIRED');
    }
    expect(await prisma.linkCode.count()).toBe(0);
    expect(await prisma.linkInvite.count()).toBe(0);
  });

  it('conta só de paciente: 403 ao resgatar código e listar pacientes', async () => {
    const code = await generateCode(BOTH);
    const agent = await loginAgent(PATIENT);

    const redeem = await agent.post('/links/redeem-code').send({ code });
    const list = await agent.get('/links/patients');

    expect(redeem.status).toBe(403);
    expect(redeem.body.error.code).toBe('THERAPIST_PROFILE_REQUIRED');
    expect(list.status).toBe(403);
    expect(await activeLinks()).toHaveLength(0);
  });

  it('a terapeuta só vê os próprios pacientes, e só os de vínculo ativo', async () => {
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: await generateCode(PATIENT) });
    await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code: await generateCode(BOTH) });

    const mine = await (await loginAgent(THERAPIST)).get('/links/patients');
    expect(mine.status).toBe(200);
    expect(mine.body.patients).toEqual([
      expect.objectContaining({ id: patientId, name: 'Paula Fictícia', email: PATIENT }),
    ]);

    await (await loginAgent(PATIENT)).post('/link/revoke');
    const afterRevoke = await (await loginAgent(THERAPIST)).get('/links/patients');
    expect(afterRevoke.body.patients).toEqual([]);
  });

  it('o paciente vê só o próprio vínculo', async () => {
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: await generateCode(PATIENT) });

    const res = await (await loginAgent(BOTH)).get('/link');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ link: null, invite: null, code: null });
  });
});

describe('código de vínculo', () => {
  it('o paciente gera um código no formato K7M4-P9QX, guardado só como HMAC', async () => {
    const code = await generateCode();

    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/);
    const stored = await prisma.linkCode.findFirstOrThrow();
    expect(stored.codeHash).toBe(hashLinkCode(code.replace('-', '')));
    expect(stored.codeHash).not.toContain(code.replace('-', ''));
    // Vale 24 horas.
    const hours = (stored.expiresAt.getTime() - stored.createdAt.getTime()) / 3_600_000;
    expect(hours).toBeCloseTo(24, 1);
  });

  it('a terapeuta digita o código e o vínculo é criado; o paciente é avisado com nome e e-mail', async () => {
    const code = await generateCode();

    const res = await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code });

    expect(res.status).toBe(201);
    expect(res.body.patient).toEqual(
      expect.objectContaining({ id: patientId, name: 'Paula Fictícia', email: PATIENT }),
    );
    const [link] = await activeLinks();
    expect(link).toMatchObject({ patientId, therapistId, method: 'CODE', seenByPatientAt: null });

    const email = mailer.lastTo(PATIENT);
    expect(email?.text).toContain('Tereza Fictícia');
    expect(email?.text).toContain(THERAPIST);

    const status = await (await loginAgent(PATIENT)).get('/link');
    expect(status.body.link).toEqual(
      expect.objectContaining({ method: 'CODE', seen: false, therapist: { name: 'Tereza Fictícia', email: THERAPIST } }),
    );
    expect(status.body.code).toBeNull();
  });

  it('aceita o código em minúsculas, sem traço e com espaços', async () => {
    const code = await generateCode();
    const typed = ` ${code.replace('-', '').toLowerCase()} `;

    const res = await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: typed });

    expect(res.status).toBe(201);
  });

  it('vale uma vez só', async () => {
    const code = await generateCode();
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code });
    await (await loginAgent(PATIENT)).post('/link/revoke');

    const res = await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
  });

  it('gerar um novo invalida o anterior', async () => {
    const first = await generateCode();
    const second = await generateCode();
    const agent = await loginAgent(THERAPIST);

    expect((await agent.post('/links/redeem-code').send({ code: first })).status).toBe(400);
    expect((await agent.post('/links/redeem-code').send({ code: second })).status).toBe(201);
  });

  it('expirado não vale', async () => {
    const code = await generateCode();
    await prisma.linkCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CODE');
    expect((await (await loginAgent(PATIENT)).get('/link')).body.code).toBeNull();
  });

  it('formato impossível dá 400 de validação e não conta como tentativa', async () => {
    const res = await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: 'O0I1-LUAA' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.linkCodeAttempt.count()).toBe(0);
  });

  it('5 erros em 15 minutos bloqueiam a terapeuta, até com o código certo (429)', async () => {
    const code = await generateCode();
    const agent = await loginAgent(THERAPIST);
    for (let i = 0; i < 5; i++) {
      const wrong = await agent.post('/links/redeem-code').send({ code: 'AAAA-AAAA' });
      expect(wrong.status).toBe(400);
    }

    const blocked = await agent.post('/links/redeem-code').send({ code });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(await activeLinks()).toHaveLength(0);
    // O bloqueio é por terapeuta: outra consegue.
    expect((await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code })).status).toBe(201);
  });

  it('depois de 15 minutos, o bloqueio acaba', async () => {
    const code = await generateCode();
    const agent = await loginAgent(THERAPIST);
    for (let i = 0; i < 5; i++) await agent.post('/links/redeem-code').send({ code: 'AAAA-AAAA' });
    await prisma.linkCodeAttempt.updateMany({ data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) } });

    const res = await agent.post('/links/redeem-code').send({ code });

    expect(res.status).toBe(201);
    expect(await prisma.linkCodeAttempt.count()).toBe(0);
  });

  it('as tentativas guardam só a terapeuta e o horário, nunca o código digitado', async () => {
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: 'AAAA-AAAA' });

    const attempt = await prisma.linkCodeAttempt.findFirstOrThrow();
    expect(Object.keys(attempt).sort()).toEqual(['createdAt', 'id', 'therapistId']);
  });

  it('ninguém se vincula a si mesmo; o código continua valendo', async () => {
    const code = await generateCode(BOTH);

    const self = await (await loginAgent(BOTH)).post('/links/redeem-code').send({ code });

    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_LINK');
    expect(await prisma.linkCodeAttempt.count()).toBe(0);
    expect((await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code })).status).toBe(201);
  });

  it('com vínculo ativo, o paciente não gera código nem convite (409)', async () => {
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: await generateCode() });
    const agent = await loginAgent(PATIENT);

    const code = await agent.post('/link/code');
    const invite = await agent.post('/link/invite').send({ email: OTHER_THERAPIST });

    expect(code.status).toBe(409);
    expect(code.body.error.code).toBe('LINK_ALREADY_ACTIVE');
    expect(invite.status).toBe(409);
    expect(invite.body.error.code).toBe('LINK_ALREADY_ACTIVE');
  });

  it('se o paciente já se vinculou por outro caminho, o código sobrando dá 409 e nada muda', async () => {
    // Situação de corrida simulada: vínculo ativo e, ao mesmo tempo, um código válido.
    await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'INVITE' } });
    await prisma.linkCode.create({
      data: { patientId, codeHash: hashLinkCode('K7M4P9QX'), expiresAt: new Date(Date.now() + 60_000) },
    });

    const res = await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code: 'K7M4-P9QX' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PATIENT_ALREADY_LINKED');
    expect(await activeLinks()).toEqual([expect.objectContaining({ therapistId })]);
  });

  it('o banco recusa dois vínculos ativos para o mesmo paciente e o vínculo consigo mesmo', async () => {
    const other = await prisma.user.findUniqueOrThrow({ where: { email: OTHER_THERAPIST } });
    await prisma.therapistLink.create({ data: { patientId, therapistId, method: 'CODE' } });

    await expect(
      prisma.therapistLink.create({ data: { patientId, therapistId: other.id, method: 'CODE' } }),
    ).rejects.toThrow();
    await expect(
      prisma.therapistLink.create({ data: { patientId: therapistId, therapistId, method: 'CODE' } }),
    ).rejects.toThrow();
  });
});

describe('convite por e-mail', () => {
  it('envia o link para a terapeuta e guarda só o hash do token', async () => {
    const token = await sendInvite();

    const email = mailer.lastTo(THERAPIST);
    expect(email?.text).toContain('http://localhost:5173/convite?token=');
    expect(email?.text).toContain('Paula Fictícia');
    const stored = await prisma.linkInvite.findFirstOrThrow();
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);

    const status = await (await loginAgent(PATIENT)).get('/link');
    expect(status.body.invite).toEqual(expect.objectContaining({ therapistEmail: THERAPIST }));
  });

  it('com convite pendente, não gera outro convite nem código (409)', async () => {
    await sendInvite();
    const agent = await loginAgent(PATIENT);

    const invite = await agent.post('/link/invite').send({ email: OTHER_THERAPIST });
    const code = await agent.post('/link/code');

    expect(invite.status).toBe(409);
    expect(invite.body.error.code).toBe('INVITE_PENDING');
    expect(code.status).toBe(409);
    expect(code.body.error.code).toBe('INVITE_PENDING');
  });

  it('convidar invalida o código que estava valendo', async () => {
    const code = await generateCode();
    await sendInvite();

    const res = await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code });

    expect(res.status).toBe(400);
  });

  it('não convida o próprio e-mail', async () => {
    const res = await (await loginAgent(PATIENT)).post('/link/invite').send({ email: ` ${PATIENT.toUpperCase()} ` });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SELF_LINK');
    expect(mailer.sent).toHaveLength(0);
  });

  it('a terapeuta com conta aceita o convite e o vínculo é criado na hora', async () => {
    const token = await sendInvite();

    const res = await (await loginAgent(THERAPIST)).post('/links/accept-invite').send({ token });

    expect(res.status).toBe(201);
    expect(res.body.patient).toEqual(expect.objectContaining({ id: patientId, name: 'Paula Fictícia' }));
    expect(await activeLinks()).toEqual([expect.objectContaining({ patientId, therapistId, method: 'INVITE' })]);
    expect(await prisma.linkInvite.findFirstOrThrow()).toMatchObject({ acceptedAt: expect.any(Date) });
    expect(mailer.lastTo(PATIENT)?.text).toContain('Tereza Fictícia');
    expect((await (await loginAgent(PATIENT)).get('/link')).body.invite).toBeNull();
  });

  it('quem aceita pode usar uma conta com outro e-mail e ganha o perfil de terapeuta', async () => {
    const token = await sendInvite('email-antigo@faisca.test');
    const account = await createConfirmedUser({ email: 'so-paciente@faisca.test', patient: true, therapist: false });

    const res = await (await loginAgent('so-paciente@faisca.test')).post('/links/accept-invite').send({ token });

    expect(res.status).toBe(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(user.hasTherapistProfile).toBe(true);
    expect(user.hasPatientProfile).toBe(true);
  });

  it('vale uma vez só', async () => {
    const token = await sendInvite();
    await (await loginAgent(THERAPIST)).post('/links/accept-invite').send({ token });

    const again = await (await loginAgent(OTHER_THERAPIST)).post('/links/accept-invite').send({ token });

    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_TOKEN');
    expect(await activeLinks()).toHaveLength(1);
  });

  it('o próprio paciente abrir o link dá 400 e não gasta o convite', async () => {
    const token = await sendInvite(THERAPIST, BOTH);

    const self = await (await loginAgent(BOTH)).post('/links/accept-invite').send({ token });

    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_LINK');
    expect((await (await loginAgent(THERAPIST)).post('/links/accept-invite').send({ token })).status).toBe(201);
  });

  it('cancelado, o link deixa de valer; cancelar sem convite dá 404', async () => {
    const token = await sendInvite();
    const patient = await loginAgent(PATIENT);

    expect((await patient.delete('/link/invite')).status).toBe(204);
    expect((await patient.delete('/link/invite')).status).toBe(404);
    const res = await (await loginAgent(THERAPIST)).post('/links/accept-invite').send({ token });

    expect(res.status).toBe(400);
    expect(await activeLinks()).toHaveLength(0);
    // Sem pendência, o paciente pode convidar de novo.
    expect((await patient.post('/link/invite').send({ email: THERAPIST })).status).toBe(201);
  });

  it('token desconhecido: 400', async () => {
    const res = await (await loginAgent(THERAPIST)).post('/links/accept-invite').send({ token: 'nao-existe' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('limite de 5 convites por hora por paciente (429)', async () => {
    const patient = await loginAgent(PATIENT);
    for (let i = 0; i < 5; i++) {
      expect((await patient.post('/link/invite').send({ email: `t${i}@faisca.test` })).status).toBe(201);
      await patient.delete('/link/invite');
    }

    const res = await patient.post('/link/invite').send({ email: THERAPIST });

    expect(res.status).toBe(429);
  });

  describe('cadastro pelo link do convite', () => {
    const NEW_THERAPIST = 'nova-terapeuta@faisca.test';
    const signup = (inviteToken: string) =>
      request(app)
        .post('/auth/signup')
        .send({
          name: 'Nina Fictícia',
          email: NEW_THERAPIST,
          password: PASSWORD,
          profiles: { patient: false, therapist: true },
          acceptPrivacy: true,
          inviteToken,
        });

    it('o vínculo sai ao confirmar o e-mail da conta nova', async () => {
      const inviteToken = await sendInvite(NEW_THERAPIST);

      expect((await signup(inviteToken)).status).toBe(202);
      const user = await prisma.user.findUniqueOrThrow({ where: { email: NEW_THERAPIST } });
      // Ainda sem vínculo: a conta não foi confirmada.
      expect(await activeLinks()).toHaveLength(0);

      const confirm = await request(app).post('/auth/confirm-email').send({ token: mailer.lastTokenTo(NEW_THERAPIST) });

      expect(confirm.status).toBe(204);
      expect(await activeLinks()).toEqual([
        expect.objectContaining({ patientId, therapistId: user.id, method: 'INVITE' }),
      ]);
      expect(mailer.lastTo(PATIENT)?.text).toContain('Nina Fictícia');
    });

    it('se o convite foi cancelado antes, a conta é confirmada e nenhum vínculo é criado', async () => {
      const inviteToken = await sendInvite(NEW_THERAPIST);
      await signup(inviteToken);
      await (await loginAgent(PATIENT)).delete('/link/invite');

      const confirm = await request(app).post('/auth/confirm-email').send({ token: mailer.lastTokenTo(NEW_THERAPIST) });

      expect(confirm.status).toBe(204);
      expect(await activeLinks()).toHaveLength(0);
    });

    it('token de convite inválido não muda a resposta do cadastro', async () => {
      const res = await signup('token-inventado');

      expect(res.status).toBe(202);
      expect(await prisma.linkInvite.count()).toBe(0);
    });
  });
});

describe('revogar e aviso de novo vínculo', () => {
  async function link() {
    await (await loginAgent(THERAPIST)).post('/links/redeem-code').send({ code: await generateCode() });
  }

  it('o paciente revoga, o acesso cai e o registro fica com revokedAt', async () => {
    await link();
    const patient = await loginAgent(PATIENT);

    expect((await patient.post('/link/revoke')).status).toBe(204);

    expect(await activeLinks()).toHaveLength(0);
    expect(await prisma.therapistLink.findFirstOrThrow()).toMatchObject({ revokedAt: expect.any(Date) });
    expect((await patient.get('/link')).body.link).toBeNull();
    expect((await (await loginAgent(THERAPIST)).get('/links/patients')).body.patients).toEqual([]);
  });

  it('revogar sem vínculo dá 404', async () => {
    const res = await (await loginAgent(PATIENT)).post('/link/revoke');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ACTIVE_LINK');
  });

  it('depois de revogar, o paciente pode se vincular de novo', async () => {
    await link();
    await (await loginAgent(PATIENT)).post('/link/revoke');

    const res = await (await loginAgent(OTHER_THERAPIST)).post('/links/redeem-code').send({ code: await generateCode() });

    expect(res.status).toBe(201);
    expect(await prisma.therapistLink.count()).toBe(2);
  });

  it('marcar como visto some com o aviso', async () => {
    await link();
    const patient = await loginAgent(PATIENT);

    expect((await patient.post('/link/seen')).status).toBe(204);

    expect((await patient.get('/link')).body.link.seen).toBe(true);
  });
});
