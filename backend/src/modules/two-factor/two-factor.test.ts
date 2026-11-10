import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { base32Decode, base32Encode, totpCode, totpStep, verifyTotp } from '../../lib/totp.js';
import { decryptSecret, encryptSecret, normalizeRecoveryCode } from '../../lib/two-factor-crypto.js';
import { createConfirmedUser, resetDatabase } from '../../test/db.js';
import { FakeMailer } from '../../test/fake-mailer.js';

// Verificação em duas etapas (DEC-092). Dados fictícios (regra 5).
const PASSWORD = 'senha-ficticia-123';
const PATIENT = 'paciente@faisca.test';
const OTHER = 'outra@faisca.test';

let mailer: FakeMailer;
let app: ReturnType<typeof createApp>;
let patientId: string;

beforeEach(async () => {
  await resetDatabase();
  mailer = new FakeMailer();
  app = createApp({ mailer });
  patientId = (await createConfirmedUser({ name: 'Paula Fictícia', email: PATIENT })).id;
  // Conta que já entrou antes: os logins dos testes geram o aviso de acesso normalmente.
  await prisma.user.update({ where: { id: patientId }, data: { hasLoggedIn: true } });
});

async function loginAgent(email = PATIENT) {
  const agent = request.agent(app);
  const res = await agent.post('/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

function lastCode(email = PATIENT): string {
  const mail = [...mailer.sent]
    .reverse()
    .find((m) => m.to === email && /^Seu código (para entrar|de confirmação)/.test(m.subject));
  const code = mail?.text.match(/é (\d{6})\./)?.[1];
  if (!code) throw new Error('Nenhum e-mail de código');
  return code;
}

// Liga o código por e-mail pela API e devolve os códigos de recuperação.
async function enableEmail(agent: ReturnType<typeof request.agent>): Promise<string[]> {
  expect((await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'EMAIL' })).status).toBe(200);
  const res = await agent.post('/auth/2fa/setup/confirm').send({ method: 'EMAIL', otp: lastCode() });
  expect(res.status).toBe(200);
  return res.body.recoveryCodes as string[];
}

// Liga o app autenticador e devolve o segredo (como o app guardaria). Com o e-mail já ligado, a
// prova é um código por e-mail.
async function enableTotp(agent: ReturnType<typeof request.agent>, withEmailProof = false): Promise<string> {
  let proof = {};
  if (withEmailProof) {
    expect((await agent.post('/auth/2fa/email-code')).status).toBe(200);
    proof = { via: 'EMAIL', otp: lastCode() };
  }
  const start = await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'TOTP', ...proof });
  expect(start.status).toBe(200);
  const secret = start.body.secret as string;
  const res = await agent.post('/auth/2fa/setup/confirm').send({ method: 'TOTP', otp: totpCode(secret, totpStep(new Date())) });
  expect(res.status).toBe(200);
  return secret;
}

describe('TOTP e segredos', () => {
  it('bate com o exemplo do RFC 6238 (SHA-1, 6 dígitos)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    // T = 59 s → passo 1 → 94287082 (8 dígitos), cujos 6 últimos são 287082.
    expect(totpCode(secret, 1)).toBe('287082');
  });

  it('aceita o passo de cada lado e barra o código já usado', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    const now = new Date(90_000);
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step), now, step)).toBeNull();
    expect(verifyTotp(secret, totpCode(secret, step + 2), now, null)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now, null)).toBeNull();
  });

  it('o segredo cifrado volta igual; adulterado, com tag curta ou de outra conta, não abre', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', 'conta-a');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored, 'conta-a')).toBe('JBSWY3DPEHPK3PXP');
    // Copiado para outra conta (achado do revisor-seguranca): não abre.
    expect(() => decryptSecret(stored, 'conta-b')).toThrow();
    const parts = stored.split('.');
    const shortTag = [...parts];
    shortTag[2] = Buffer.from(parts[2]!, 'base64url').subarray(0, 4).toString('base64url');
    expect(() => decryptSecret(shortTag.join('.'), 'conta-a')).toThrow();
    parts[3] = Buffer.from('outro-texto').toString('base64url');
    expect(() => decryptSecret(parts.join('.'), 'conta-a')).toThrow();
  });

  it('o código de recuperação aceita minúsculas e traço', () => {
    expect(normalizeRecoveryCode('k7m4-p9qx')).toBe('K7M4P9QX');
    expect(normalizeRecoveryCode('0000-0000')).toBeNull();
  });
});

describe('ativar a verificação em duas etapas', () => {
  it('por e-mail: pede a senha, manda o código, liga, dá 10 códigos e tira os outros aparelhos', async () => {
    const phone = await loginAgent();
    const laptop = await loginAgent();

    const recoveryCodes = await enableEmail(phone);

    expect(recoveryCodes).toHaveLength(10);
    expect(recoveryCodes[0]).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    expect((await phone.get('/auth/me')).status).toBe(200);
    expect((await laptop.get('/auth/me')).status).toBe(401);
    expect((await phone.get('/auth/2fa')).body).toMatchObject({ emailEnabled: true, totpEnabled: false, recoveryCodesLeft: 10 });
    await vi.waitFor(() =>
      expect(mailer.sent.some((m) => m.subject === 'A verificação em duas etapas foi ligada')).toBe(true),
    );
    const enabled = mailer.sent.find((m) => m.subject === 'A verificação em duas etapas foi ligada')!;
    expect(enabled.text).not.toMatch(/https?:\/\//);
  });

  it('senha errada: 400 e nenhum e-mail de código', async () => {
    const agent = await loginAgent();
    const res = await agent.post('/auth/2fa/setup').send({ password: 'senha-errada-456', method: 'EMAIL' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
    expect(() => lastCode()).toThrow();
  });

  it('código errado não liga', async () => {
    const agent = await loginAgent();
    await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'EMAIL' });
    const res = await agent.post('/auth/2fa/setup/confirm').send({ method: 'EMAIL', otp: '000000' === lastCode() ? '111111' : '000000' });
    expect(res.status).toBe(400);
    expect((await agent.get('/auth/2fa')).body.emailEnabled).toBe(false);
  });

  it('app autenticador como segundo jeito: pede um código do primeiro, avisa por e-mail e não gera códigos novos', async () => {
    const agent = await loginAgent();
    await enableEmail(agent);

    // Só a senha não liga um segundo jeito (achado do revisor-seguranca).
    const withoutProof = await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'TOTP' });
    expect(withoutProof.status).toBe(400);
    expect(withoutProof.body.error.code).toBe('CODE_REQUIRED');

    const secret = await enableTotp(agent, true);
    await vi.waitFor(() =>
      expect(mailer.sent.some((m) => m.subject === 'Um novo jeito de confirmar que é você foi ligado')).toBe(true),
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });
    expect(user.totpSecret).not.toContain(secret);
    expect(user.totpPendingSecret).toBeNull();
    expect((await agent.get('/auth/2fa')).body).toMatchObject({ emailEnabled: true, totpEnabled: true, recoveryCodesLeft: 10 });
  });

  it('sem sessão: 401 em todas as rotas de Conta', async () => {
    expect((await request(app).get('/auth/2fa')).status).toBe(401);
    expect((await request(app).post('/auth/2fa/setup').send({ password: PASSWORD, method: 'EMAIL' })).status).toBe(401);
    expect((await request(app).post('/auth/2fa/disable').send({ password: PASSWORD, via: 'EMAIL', otp: '123456' })).status).toBe(401);
  });

  it('campo a mais é recusado (a conta é sempre a da sessão)', async () => {
    const otherId = (await createConfirmedUser({ email: OTHER })).id;
    const agent = await loginAgent();
    const res = await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'EMAIL', userId: otherId });
    expect(res.status).toBe(400);
  });
});

describe('login com a verificação em duas etapas', () => {
  it('a senha certa não abre a sessão: pede o código; o código certo abre e só então avisa o acesso', async () => {
    await enableEmail(await loginAgent());
    mailer.sent.length = 0;
    const agent = request.agent(app);

    const first = await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect(first.status).toBe(200);
    expect(first.body.user).toBeUndefined();
    expect(first.body.twoFactor).toEqual({ methods: ['EMAIL'], preferred: 'EMAIL', emailHint: 'pa•••@faisca.test' });
    expect((await agent.get('/auth/me')).status).toBe(401);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mailer.sent.filter((m) => m.subject === 'Novo acesso à sua conta no Faísca')).toHaveLength(0);

    expect((await agent.post('/auth/2fa/login/email')).status).toBe(204);
    const res = await agent.post('/auth/2fa/login/verify').send({ via: 'EMAIL', otp: lastCode() });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(PATIENT);
    expect((await agent.get('/auth/me')).status).toBe(200);
    await vi.waitFor(() =>
      expect(mailer.sent.filter((m) => m.subject === 'Novo acesso à sua conta no Faísca')).toHaveLength(1),
    );
  });

  it('5 tentativas erradas esgotam o desafio: nem o código certo entra depois', async () => {
    await enableEmail(await loginAgent());
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    await agent.post('/auth/2fa/login/email');
    const right = lastCode();
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect((await agent.post('/auth/2fa/login/verify').send({ via: 'EMAIL', otp: wrong })).status).toBe(400);
    }
    expect((await agent.post('/auth/2fa/login/verify').send({ via: 'EMAIL', otp: right })).status).toBe(429);
    expect((await agent.get('/auth/me')).status).toBe(401);
  });

  it('app autenticador: entra com o código do app, e o mesmo código não vale de novo', async () => {
    const setup = await loginAgent();
    const secret = await enableTotp(setup);

    // Espera o próximo passo de 30 s não é prático: usa o passo seguinte, que a janela aceita.
    const code = totpCode(secret, totpStep(new Date()) + 1);
    const agent = request.agent(app);
    const first = await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect(first.body.twoFactor).toMatchObject({ methods: ['TOTP'], preferred: 'TOTP' });
    expect((await agent.post('/auth/2fa/login/verify').send({ via: 'TOTP', otp: code })).status).toBe(200);

    const again = request.agent(app);
    await again.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await again.post('/auth/2fa/login/verify').send({ via: 'TOTP', otp: code })).status).toBe(400);
  });

  it('código de recuperação: entra uma vez; o mesmo código não vale de novo', async () => {
    const recoveryCodes = await enableEmail(await loginAgent());
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await agent.post('/auth/2fa/login/verify').send({ via: 'RECOVERY', otp: recoveryCodes[0]!.toLowerCase() })).status).toBe(200);

    const again = request.agent(app);
    await again.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await again.post('/auth/2fa/login/verify').send({ via: 'RECOVERY', otp: recoveryCodes[0] })).status).toBe(400);
  });

  it('sem o cookie do passo do código: 401; e o cookie do passo não serve de sessão', async () => {
    await enableEmail(await loginAgent());
    expect((await request(app).post('/auth/2fa/login/verify').send({ via: 'EMAIL', otp: '123456' })).status).toBe(401);
    expect((await request(app).post('/auth/2fa/login/email')).status).toBe(401);

    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await agent.get('/auth/me')).status).toBe(401);
    expect((await agent.get('/auth/2fa')).status).toBe(401);
  });

  it('"Esqueci minha senha" não desliga a verificação', async () => {
    await enableEmail(await loginAgent());
    await request(app).post('/auth/forgot-password').send({ email: PATIENT });
    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)?.subject).toMatch(/nova senha/i));
    const token = mailer.lastTokenTo(PATIENT);
    expect((await request(app).post('/auth/reset-password').send({ token, password: 'senha-nova-ficticia-789' })).status).toBe(204);

    const res = await request(app).post('/auth/login').send({ email: PATIENT, password: 'senha-nova-ficticia-789' });
    expect(res.status).toBe(200);
    expect(res.body.twoFactor).toBeDefined();
  });

  it('pedidos de código por e-mail têm limite por desafio', async () => {
    await enableEmail(await loginAgent());
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await agent.post('/auth/2fa/login/email')).status).toBe(204);
    // O segundo, logo em seguida, ainda não pode (espera de 30 s).
    expect((await agent.post('/auth/2fa/login/email')).status).toBe(429);
  });
});

describe('desligar e gerar códigos novos', () => {
  it('desligar pede a senha e um código; depois o login não pede mais e chega o e-mail', async () => {
    const recoveryCodes = await enableEmail(await loginAgent());
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    await agent.post('/auth/2fa/login/verify').send({ via: 'RECOVERY', otp: recoveryCodes[0] });

    expect((await agent.post('/auth/2fa/disable').send({ password: 'senha-errada-456', via: 'RECOVERY', otp: recoveryCodes[1] })).status).toBe(400);
    expect((await agent.post('/auth/2fa/disable').send({ password: PASSWORD, via: 'RECOVERY', otp: recoveryCodes[0] })).status).toBe(400);
    expect((await agent.post('/auth/2fa/disable').send({ password: PASSWORD, via: 'RECOVERY', otp: recoveryCodes[1] })).status).toBe(204);

    expect(await prisma.recoveryCode.count({ where: { userId: patientId } })).toBe(0);
    const res = await request(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect(res.body.user.email).toBe(PATIENT);
    await vi.waitFor(() =>
      expect(mailer.sent.some((m) => m.subject === 'A verificação em duas etapas foi desligada')).toBe(true),
    );
  });

  it('desligar com o código por e-mail da ação', async () => {
    const agent = await loginAgent();
    await enableEmail(agent);
    expect((await agent.post('/auth/2fa/email-code')).status).toBe(200);
    expect((await agent.post('/auth/2fa/disable').send({ password: PASSWORD, via: 'EMAIL', otp: lastCode() })).status).toBe(204);
    expect((await agent.get('/auth/2fa')).body.emailEnabled).toBe(false);
  });

  it('gerar códigos novos pede a senha e um código, avisa por e-mail e invalida os antigos', async () => {
    const agent = await loginAgent();
    const old = await enableEmail(agent);
    // Só a senha não basta (achado do revisor-seguranca).
    expect((await agent.post('/auth/2fa/recovery-codes').send({ password: PASSWORD })).status).toBe(400);
    const res = await agent.post('/auth/2fa/recovery-codes').send({ password: PASSWORD, via: 'RECOVERY', otp: old[9] });
    expect(res.status).toBe(200);
    expect(res.body.recoveryCodes).toHaveLength(10);
    await vi.waitFor(() =>
      expect(mailer.sent.some((m) => m.subject === 'Seus códigos de recuperação foram trocados')).toBe(true),
    );

    const login = request.agent(app);
    await login.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect((await login.post('/auth/2fa/login/verify').send({ via: 'RECOVERY', otp: old[0] })).status).toBe(400);
  });
});

describe('teto de códigos errados por conta e senha trocada', () => {
  // Trocar de IP e abrir um login novo a cada 5 tentativas não dá chutes sem fim (achado do
  // revisor-seguranca): 10 códigos errados em 15 min travam a entrada da conta e avisam por e-mail.
  it('10 códigos errados, em vários logins, travam a conta e mandam o aviso', async () => {
    await enableTotp(await loginAgent());
    for (let round = 0; round < 2; round++) {
      const agent = request.agent(app);
      expect((await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD })).status).toBe(200);
      for (let i = 0; i < 5; i++) {
        expect((await agent.post('/auth/2fa/login/verify').send({ via: 'TOTP', otp: '000000' })).status).toBe(400);
      }
    }
    const blocked = await request(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    expect(blocked.status).toBe(429);
    await vi.waitFor(() =>
      expect(mailer.sent.filter((m) => m.subject === 'Tentativas de entrar na sua conta do Faísca')).toHaveLength(1),
    );

    // A dona cria uma senha nova pelo e-mail do aviso: a trava acaba e o login volta a pedir o código.
    await request(app).post('/auth/forgot-password').send({ email: PATIENT });
    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)?.subject).toMatch(/nova senha/i));
    const token = mailer.lastTokenTo(PATIENT);
    expect((await request(app).post('/auth/reset-password').send({ token, password: 'senha-nova-ficticia-789' })).status).toBe(204);
    const after = await request(app).post('/auth/login').send({ email: PATIENT, password: 'senha-nova-ficticia-789' });
    expect(after.status).toBe(200);
    expect(after.body.twoFactor.methods).toEqual(['TOTP']);
  }, 30_000);

  it('logins juntos deixam um passo do código aberto só', async () => {
    await enableTotp(await loginAgent());
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(app).post('/auth/login').send({ email: PATIENT, password: PASSWORD })),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const open = await prisma.twoFactorChallenge.count({ where: { userId: patientId, purpose: 'LOGIN', consumedAt: null } });
    expect(open).toBe(1);
  });

  it('senha nova fecha o passo do código que estava aberto', async () => {
    await enableEmail(await loginAgent());
    const agent = request.agent(app);
    await agent.post('/auth/login').send({ email: PATIENT, password: PASSWORD });
    await agent.post('/auth/2fa/login/email');
    const code = lastCode();

    await request(app).post('/auth/forgot-password').send({ email: PATIENT });
    await vi.waitFor(() => expect(mailer.lastTo(PATIENT)?.subject).toMatch(/nova senha/i));
    const token = mailer.lastTokenTo(PATIENT);
    await request(app).post('/auth/reset-password').send({ token, password: 'senha-nova-ficticia-789' });

    const res = await agent.post('/auth/2fa/login/verify').send({ via: 'EMAIL', otp: code });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TWO_FACTOR_EXPIRED');
  });
});

describe('segredo pendente do app e ordem das conferências', () => {
  // Achado do revisor-seguranca: um segredo do app pedido antes, e nunca confirmado, não liga o app
  // depois que o e-mail foi ligado, nem depois de 10 min.
  it('ligar o e-mail apaga o segredo do app que estava pendente', async () => {
    const agent = await loginAgent();
    const start = await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'TOTP' });
    const oldSecret = start.body.secret as string;
    await enableEmail(agent);
    const res = await agent.post('/auth/2fa/setup/confirm').send({ method: 'TOTP', otp: totpCode(oldSecret, totpStep(new Date())) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_EXPIRED');
    expect((await agent.get('/auth/2fa')).body.totpEnabled).toBe(false);
  });

  it('o segredo pendente vence em 10 minutos', async () => {
    const agent = await loginAgent();
    const secret = 'JBSWY3DPEHPK3PXP';
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    await prisma.user.update({
      where: { id: patientId },
      data: { totpPendingSecret: encryptSecret(`${elevenMinutesAgo}.${secret}`, patientId) },
    });
    const res = await agent.post('/auth/2fa/setup/confirm').send({ method: 'TOTP', otp: totpCode(secret, totpStep(new Date())) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CODE_EXPIRED');
  });

  it('pedir para ligar um jeito já ligado não gasta um código de recuperação', async () => {
    const agent = await loginAgent();
    const codes = await enableEmail(agent);
    const res = await agent.post('/auth/2fa/setup').send({ password: PASSWORD, method: 'EMAIL', via: 'RECOVERY', otp: codes[0] });
    expect(res.status).toBe(409);
    expect((await agent.get('/auth/2fa')).body.recoveryCodesLeft).toBe(10);
  });
});
