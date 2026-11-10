import { timingSafeEqual } from 'node:crypto';
import { AppError } from '../../errors/app-error.js';
import type { TwoFactorChallenge, User } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../../lib/totp.js';
import {
  decryptSecret,
  encryptSecret,
  formatRecoveryCode,
  generateEmailCode,
  generateRecoveryCode,
  hashCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
  twoFactorConfigured,
} from '../../lib/two-factor-crypto.js';
import {
  twoFactorBlockedEmail,
  twoFactorCodeEmail,
  twoFactorDisabledEmail,
  twoFactorEnabledEmail,
  twoFactorMethodAddedEmail,
  twoFactorNewCodesEmail,
} from './two-factor.emails.js';
import type { CodeVia, TwoFactorMethod } from './two-factor.schema.js';

// Verificação em duas etapas (DEC-092): código por e-mail e app autenticador, com códigos de
// recuperação. Os desafios ficam no banco (TwoFactorChallenge): o do login, entre a senha e o código,
// e o de uma ação com a sessão aberta (ativar o e-mail, desligar o 2FA).

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_EMAIL_SENDS = 3;
const EMAIL_RESEND_GAP_MS = 30 * 1000;
// Teto de e-mails de código por conta, somando todos os desafios: abrir um desafio novo a cada
// pedido não vira um jeito de mandar e-mails sem fim (nem de gastar a cota do Resend).
const CODE_EMAILS_PER_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;
// Teto de códigos errados por conta, somando todos os desafios: quem tem a senha não chuta códigos
// sem fim abrindo um login novo a cada 5 tentativas (achado do revisor-seguranca).
const CODE_FAILURES_LIMIT = 10;
const CODE_FAILURES_WINDOW_MS = 15 * 60 * 1000;

const invalidCode = () => new AppError(400, 'INVALID_CODE', 'Esse código não confere. Confira e tente de novo.');
const expiredCode = () => new AppError(400, 'CODE_EXPIRED', 'Esse código venceu. Peça um novo.');
const tooMany = () =>
  new AppError(
    429,
    'TOO_MANY_REQUESTS',
    'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.',
  );
const unavailable = () =>
  new AppError(
    503,
    'TWO_FACTOR_UNAVAILABLE',
    'A verificação em duas etapas está indisponível agora. Tente de novo mais tarde.',
  );
const challengeGone = () =>
  new AppError(401, 'TWO_FACTOR_EXPIRED', 'O tempo para confirmar acabou. Entre de novo com o seu e-mail e a sua senha.');

export type LoginMethod = TwoFactorMethod;

export function hasTwoFactor(user: Pick<User, 'twoFactorEmail' | 'totpEnabledAt'>): boolean {
  return user.twoFactorEmail || user.totpEnabledAt !== null;
}

// "lu•••@gmail.com": quem chegou ao passo do código só mostrou que sabe a senha.
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}•••@${domain}`;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createTwoFactorService(mailer: Mailer) {
  // Em memória, como os outros limites (uma instância só no Railway, DEC-025).
  const codeEmailsSent = new Map<string, number[]>();
  const codeFailures = new Map<string, number[]>();
  const blockedWarnedAt = new Map<string, number>();

  function recentFailures(userId: string, now: number): number[] {
    const recent = (codeFailures.get(userId) ?? []).filter((at) => now - at < CODE_FAILURES_WINDOW_MS);
    if (recent.length > 0) codeFailures.set(userId, recent);
    else codeFailures.delete(userId);
    return recent;
  }

  function requireNotBlocked(userId: string, now: Date) {
    if (recentFailures(userId, now.getTime()).length >= CODE_FAILURES_LIMIT) throw tooMany();
  }

  function releaseFailure(userId: string, at: number) {
    const list = codeFailures.get(userId);
    const index = list?.indexOf(at) ?? -1;
    if (list && index >= 0) list.splice(index, 1);
  }

  // Ao chegar no teto, a entrada trava por 15 min e a pessoa recebe um e-mail (um por trava): alguém
  // acertou a senha, mas não o código.
  async function warnIfBlocked(user: User, at: number) {
    if (recentFailures(user.id, at).length < CODE_FAILURES_LIMIT) return;
    const warned = blockedWarnedAt.get(user.id);
    if (warned !== undefined && at - warned < CODE_FAILURES_WINDOW_MS) return;
    blockedWarnedAt.set(user.id, at);
    logger.warn({ userId: user.id }, 'Verificação em duas etapas: muitos códigos errados, entrada travada');
    await sendSafely('two-factor-blocked', twoFactorBlockedEmail(user.email, user.name));
  }

  // Cada tentativa de código ocupa uma vaga do teto da conta antes do primeiro await, para pedidos
  // juntos não passarem dele (achado do revisor-seguranca). Código certo, ou erro que não é de
  // código, devolve a vaga; código errado ou vencido a mantém.
  async function countingFailures(user: User, now: Date, run: () => Promise<void>): Promise<void> {
    const at = now.getTime();
    const recent = recentFailures(user.id, at);
    if (recent.length >= CODE_FAILURES_LIMIT) throw tooMany();
    recent.push(at);
    codeFailures.set(user.id, recent);
    try {
      await run();
    } catch (err) {
      if (err instanceof AppError && (err.code === 'INVALID_CODE' || err.code === 'CODE_EXPIRED')) {
        await warnIfBlocked(user, at);
      } else {
        releaseFailure(user.id, at);
      }
      throw err;
    }
    releaseFailure(user.id, at);
  }

  function takeCodeEmailSlot(userId: string, now: number): boolean {
    const recent = (codeEmailsSent.get(userId) ?? []).filter((at) => now - at < HOUR_MS);
    const allowed = recent.length < CODE_EMAILS_PER_HOUR;
    if (allowed) recent.push(now);
    if (recent.length > 0) codeEmailsSent.set(userId, recent);
    else codeEmailsSent.delete(userId);
    return allowed;
  }

  // Como no auth: falha no envio não derruba a requisição, e o log leva só o tipo.
  async function sendSafely(kind: string, message: EmailMessage) {
    try {
      await mailer.send(message);
    } catch (err) {
      logger.error({ err, kind }, 'Falha ao enviar e-mail do 2FA');
    }
  }

  function requireConfigured() {
    if (!twoFactorConfigured()) throw unavailable();
  }

  async function newChallenge(userId: string, purpose: 'LOGIN' | 'ACTION', now: Date) {
    // Um desafio aberto por conta e por tipo: o novo invalida os anteriores. A trava na linha da
    // conta faz pedidos juntos passarem um de cada vez, e só o último desafio fica aberto (achado do
    // revisor-seguranca).
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.twoFactorChallenge.deleteMany({ where: { userId, purpose, consumedAt: null } });
      return tx.twoFactorChallenge.create({
        data: { userId, purpose, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) },
      });
    });
  }

  async function sendChallengeEmail(challenge: TwoFactorChallenge, user: User, now: Date) {
    if (challenge.emailSends >= MAX_EMAIL_SENDS) throw tooMany();
    if (challenge.lastEmailSentAt && now.getTime() - challenge.lastEmailSentAt.getTime() < EMAIL_RESEND_GAP_MS) {
      throw tooMany();
    }
    if (!takeCodeEmailSlot(user.id, now.getTime())) throw tooMany();
    const code = generateEmailCode();
    // Condicional no número de envios: dois pedidos juntos não passam do limite.
    const { count } = await prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, emailSends: challenge.emailSends },
      data: {
        emailCodeHash: hashCode(code),
        emailCodeExpiresAt: new Date(now.getTime() + EMAIL_CODE_TTL_MS),
        emailSends: { increment: 1 },
        lastEmailSentAt: now,
      },
    });
    if (count === 0) throw tooMany();
    await sendSafely('two-factor-code', twoFactorCodeEmail(user.email, user.name, code, challenge.purpose === 'LOGIN'));
  }

  async function countAttempt(challengeId: string) {
    const { count } = await prisma.twoFactorChallenge.updateMany({
      where: { id: challengeId, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (count === 0) throw tooMany();
  }

  async function checkTotp(user: User, otp: string, now: Date) {
    if (!user.totpEnabledAt || !user.totpSecret) throw invalidCode();
    const step = verifyTotp(decryptSecret(user.totpSecret, user.id), otp, now, user.totpLastStep);
    if (step === null) throw invalidCode();
    // Grava o passo usado: o mesmo código não vale duas vezes, nem em dois pedidos juntos.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    if (count === 0) throw invalidCode();
  }

  async function useRecoveryCode(userId: string, otp: string, now: Date) {
    const code = normalizeRecoveryCode(otp);
    if (!code) throw invalidCode();
    const { count } = await prisma.recoveryCode.updateMany({
      where: { userId, codeHash: hashCode(code), usedAt: null },
      data: { usedAt: now },
    });
    if (count === 0) throw invalidCode();
  }

  function checkEmailCode(challenge: TwoFactorChallenge, otp: string, now: Date) {
    if (!challenge.emailCodeHash || !challenge.emailCodeExpiresAt) throw invalidCode();
    if (challenge.emailCodeExpiresAt <= now) throw expiredCode();
    if (!/^\d{6}$/.test(otp) || !sameHash(hashCode(otp), challenge.emailCodeHash)) throw invalidCode();
  }

  // Confere um código dentro de um desafio. Conta a tentativa antes de conferir (5 no máximo) e,
  // se der certo, consome o desafio: ele não vale de novo.
  async function verifyInChallenge(user: User, challenge: TwoFactorChallenge, via: CodeVia, otp: string, now: Date) {
    if (challenge.consumedAt || challenge.expiresAt <= now) throw challengeGone();
    await countAttempt(challenge.id);
    if (via === 'EMAIL') checkEmailCode(challenge, otp, now);
    else if (via === 'TOTP') await checkTotp(user, otp, now);
    else await useRecoveryCode(user.id, otp, now);
    const { count } = await prisma.twoFactorChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (count === 0) throw challengeGone();
  }

  // Prova de que a pessoa tem um jeito já ligado, para ações com a sessão aberta (desligar, gerar
  // códigos, ligar um segundo jeito): a senha sozinha não basta (achado do revisor-seguranca).
  async function verifyActionCode(user: User, via: CodeVia, otp: string, now: Date) {
    await countingFailures(user, now, async () => {
      if (via === 'EMAIL') {
        if (!user.twoFactorEmail) throw invalidCode();
        const challenge = await openChallenge(user.id, 'ACTION', now);
        if (!challenge) throw expiredCode();
        await verifyInChallenge(user, challenge, 'EMAIL', otp, now);
      } else if (via === 'TOTP') {
        await checkTotp(user, otp, now);
      } else {
        await useRecoveryCode(user.id, otp, now);
      }
    });
  }

  async function openChallenge(userId: string, purpose: 'LOGIN' | 'ACTION', now: Date, id?: string) {
    const challenge = await prisma.twoFactorChallenge.findFirst({
      where: { userId, purpose, consumedAt: null, ...(id ? { id } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge || challenge.expiresAt <= now) return null;
    return challenge;
  }

  // O segredo pendente do app leva a hora em que foi criado e vence como um desafio (achado do
  // revisor-seguranca): um segredo guardado há tempos não liga o app depois.
  function sealPendingSecret(secret: string, userId: string, now: Date): string {
    return encryptSecret(`${now.getTime()}.${secret}`, userId);
  }

  function openPendingSecret(user: User, now: Date): string {
    if (!user.totpPendingSecret) throw expiredCode();
    const [createdAt, secret] = decryptSecret(user.totpPendingSecret, user.id).split('.');
    const age = now.getTime() - Number(createdAt);
    if (!secret || !Number.isFinite(age) || age < 0 || age > CHALLENGE_TTL_MS) throw expiredCode();
    return secret;
  }

  async function freshRecoveryCodes(tx: Pick<typeof prisma, 'recoveryCode'>, userId: string) {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashCode(code) })) });
    return codes.map(formatRecoveryCode);
  }

  return {
    async checkPassword(user: User, password: string) {
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AppError(400, 'INVALID_PASSWORD', 'A senha não confere.');
      }
    },

    async status(userId: string) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const recoveryCodesLeft = await prisma.recoveryCode.count({ where: { userId, usedAt: null } });
      return {
        available: twoFactorConfigured(),
        emailEnabled: user.twoFactorEmail,
        totpEnabled: user.totpEnabledAt !== null,
        recoveryCodesLeft,
      };
    },

    // Começa a ativar um método. E-mail: manda o código. App: gera o segredo, guardado cifrado como
    // "pendente" até a pessoa provar que o app funciona.
    async startSetup(user: User, method: TwoFactorMethod, proof: { via: CodeVia; otp: string } | null, now = new Date()) {
      requireConfigured();
      // Antes de conferir o código, para um pedido repetido não gastar um código de recuperação.
      if (method === 'EMAIL' && user.twoFactorEmail) {
        throw new AppError(409, 'ALREADY_ENABLED', 'O código por e-mail já está ligado.');
      }
      if (method === 'TOTP' && user.totpEnabledAt) {
        throw new AppError(409, 'ALREADY_ENABLED', 'O app autenticador já está ligado.');
      }
      // Ligar um segundo jeito pede um código do jeito que já está ligado.
      if (hasTwoFactor(user)) {
        if (!proof) throw new AppError(400, 'CODE_REQUIRED', 'Confirme com um código de um jeito que já está ligado.');
        await verifyActionCode(user, proof.via, proof.otp, now);
      }
      if (method === 'EMAIL') {
        const challenge = await newChallenge(user.id, 'ACTION', now);
        await sendChallengeEmail(challenge, user, now);
        return { method, emailHint: maskEmail(user.email) } as const;
      }
      const secret = generateTotpSecret();
      await prisma.user.update({
        where: { id: user.id },
        data: { totpPendingSecret: sealPendingSecret(secret, user.id, now) },
      });
      return { method, secret, uri: totpUri(secret, user.email) } as const;
    },

    // Liga o método depois do código certo. No primeiro método, gera os códigos de recuperação e
    // sobe o sessionVersion (os outros aparelhos saem; o controller mantém este), decisão do usuário.
    async confirmSetup(user: User, method: TwoFactorMethod, otp: string, now = new Date()) {
      requireConfigured();
      let totpStep: number | null = null;
      let totpSecret: string | null = null;
      if (method === 'EMAIL') {
        if (user.twoFactorEmail) throw new AppError(409, 'ALREADY_ENABLED', 'O código por e-mail já está ligado.');
        const challenge = await openChallenge(user.id, 'ACTION', now);
        if (!challenge) throw expiredCode();
        await verifyInChallenge(user, challenge, 'EMAIL', otp, now);
      } else {
        if (user.totpEnabledAt) throw new AppError(409, 'ALREADY_ENABLED', 'O app autenticador já está ligado.');
        totpSecret = openPendingSecret(user, now);
        totpStep = verifyTotp(totpSecret, otp, now, null);
        if (totpStep === null) throw invalidCode();
      }

      const firstMethod = !hasTwoFactor(user);
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: user.id },
          data: {
            // Ligar o e-mail apaga um segredo do app pendente, criado antes por quem tinha a sessão.
            ...(method === 'EMAIL'
              ? { twoFactorEmail: true, totpPendingSecret: null }
              : {
                  totpSecret: encryptSecret(totpSecret!, user.id),
                  totpPendingSecret: null,
                  totpEnabledAt: now,
                  totpLastStep: totpStep,
                }),
            ...(firstMethod ? { sessionVersion: { increment: 1 } } : {}),
          },
        });
        const recoveryCodes = firstMethod ? await freshRecoveryCodes(tx, user.id) : null;
        return { updated, recoveryCodes };
      });

      logger.info({ userId: user.id, method }, 'Verificação em duas etapas: método ligado');
      if (firstMethod) await sendSafely('two-factor-enabled', twoFactorEnabledEmail(user.email, user.name));
      else await sendSafely('two-factor-method-added', twoFactorMethodAddedEmail(user.email, user.name, method));
      return { user: result.updated, recoveryCodes: result.recoveryCodes };
    },

    // Códigos novos pedem a senha (no controller) e um código de um jeito ligado, e avisam por e-mail.
    async regenerateRecoveryCodes(user: User, via: CodeVia, otp: string, now = new Date()) {
      requireConfigured();
      if (!hasTwoFactor(user)) throw new AppError(409, 'NOT_ENABLED', 'A verificação em duas etapas está desligada.');
      await verifyActionCode(user, via, otp, now);
      const codes = await prisma.$transaction((tx) => freshRecoveryCodes(tx, user.id));
      await sendSafely('two-factor-new-codes', twoFactorNewCodesEmail(user.email, user.name));
      return codes;
    },

    // Código por e-mail para uma ação com a sessão aberta (desligar o 2FA).
    async sendActionEmailCode(user: User, now = new Date()) {
      requireConfigured();
      if (!user.twoFactorEmail) throw new AppError(409, 'NOT_ENABLED', 'O código por e-mail está desligado.');
      const challenge = await newChallenge(user.id, 'ACTION', now);
      await sendChallengeEmail(challenge, user, now);
      return { emailHint: maskEmail(user.email) };
    },

    // Desliga tudo: os dois métodos e os códigos de recuperação. Pede um código de qualquer jeito ligado.
    async disable(user: User, via: CodeVia, otp: string, now = new Date()) {
      requireConfigured();
      if (!hasTwoFactor(user)) throw new AppError(409, 'NOT_ENABLED', 'A verificação em duas etapas está desligada.');
      await verifyActionCode(user, via, otp, now);
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: {
            twoFactorEmail: false,
            totpSecret: null,
            totpEnabledAt: null,
            totpLastStep: null,
            totpPendingSecret: null,
            twoFactorLastMethod: null,
          },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId: user.id } }),
        prisma.twoFactorChallenge.deleteMany({ where: { userId: user.id } }),
      ]);
      logger.info({ userId: user.id }, 'Verificação em duas etapas: desligada');
      await sendSafely('two-factor-disabled', twoFactorDisabledEmail(user.email, user.name));
    },

    // Login, depois da senha certa: abre o desafio e diz quais jeitos a tela oferece.
    async beginLogin(user: User, now = new Date()) {
      requireConfigured();
      requireNotBlocked(user.id, now);
      const challenge = await newChallenge(user.id, 'LOGIN', now);
      const methods: LoginMethod[] = [];
      if (user.twoFactorEmail) methods.push('EMAIL');
      if (user.totpEnabledAt) methods.push('TOTP');
      const last = user.twoFactorLastMethod as LoginMethod | null;
      const preferred: LoginMethod = last && methods.includes(last) ? last : methods[0]!;
      return { challengeId: challenge.id, methods, preferred, emailHint: maskEmail(user.email) };
    },

    async sendLoginEmailCode(userId: string, challengeId: string, now = new Date()) {
      requireConfigured();
      const challenge = await openChallenge(userId, 'LOGIN', now, challengeId);
      if (!challenge) throw challengeGone();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!user.twoFactorEmail) throw new AppError(409, 'NOT_ENABLED', 'O código por e-mail está desligado.');
      await sendChallengeEmail(challenge, user, now);
    },

    // Confere o código do login. Se certo, devolve a conta para o controller abrir a sessão.
    async verifyLogin(userId: string, challengeId: string, via: CodeVia, otp: string, now = new Date()) {
      requireConfigured();
      const challenge = await openChallenge(userId, 'LOGIN', now, challengeId);
      if (!challenge) throw challengeGone();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      await countingFailures(user, now, async () => {
        if (via === 'EMAIL' && !user.twoFactorEmail) throw invalidCode();
        await verifyInChallenge(user, challenge, via, otp, now);
      });
      // A sessão sai com o sessionVersion lido antes de consumir o desafio: se a senha mudar no meio,
      // a troca apaga o desafio (o consumo falha) ou derruba esta sessão (achado do revisor-seguranca).
      if (via !== 'RECOVERY') {
        await prisma.user.update({ where: { id: userId }, data: { twoFactorLastMethod: via } });
      }
      return user;
    },

    // Senha nova: a trava de códigos errados da conta acaba, para a dona entrar logo.
    clearFailures(userId: string) {
      codeFailures.delete(userId);
      blockedWarnedAt.delete(userId);
    },
  };
}

export type TwoFactorService = ReturnType<typeof createTwoFactorService>;
