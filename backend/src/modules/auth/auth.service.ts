import { AppError } from '../../errors/app-error.js';
import { Prisma, type AuthTokenType, type User } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateToken, hashToken } from '../../lib/secure-token.js';
import { accountExistsEmail, confirmationEmail, passwordResetEmail } from './auth.emails.js';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.schema.js';

const HOUR_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_CONFIRMATION: 24 * HOUR_MS,
  PASSWORD_RESET: 1 * HOUR_MS,
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  profiles: { patient: boolean; therapist: boolean };
};

export function toPublicUser(
  user: Pick<User, 'id' | 'name' | 'email' | 'hasPatientProfile' | 'hasTherapistProfile'>,
): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profiles: { patient: user.hasPatientProfile, therapist: user.hasTherapistProfile },
  };
}

function invalidToken() {
  return new AppError(400, 'INVALID_TOKEN', 'Este link é inválido, já foi usado ou expirou.');
}

export function createAuthService(mailer: Mailer) {
  // Falha no envio não derruba a requisição: a pessoa pode pedir o e-mail de novo.
  // O log leva só o tipo do e-mail, nunca o destinatário nem o link.
  async function sendSafely(kind: string, message: EmailMessage) {
    try {
      await mailer.send(message);
    } catch (err) {
      logger.error({ err, emailKind: kind }, 'Falha ao enviar e-mail');
    }
  }

  // Um token novo invalida os anteriores do mesmo tipo que ainda não foram usados.
  async function issueToken(userId: string, type: AuthTokenType): Promise<string> {
    const token = generateToken();
    await prisma.$transaction([
      prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
      prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
        },
      }),
    ]);
    return token;
  }

  // Marca o token como usado e devolve o dono. O UPDATE condicional é atômico:
  // dois cliques simultâneos no mesmo link não passam os dois.
  async function consumeToken(tx: Prisma.TransactionClient, token: string, type: AuthTokenType) {
    const tokenHash = hashToken(token);
    const now = new Date();
    const { count } = await tx.authToken.updateMany({
      where: { tokenHash, type, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count === 0) throw invalidToken();
    const { userId } = await tx.authToken.findUniqueOrThrow({ where: { tokenHash } });
    return { userId, now };
  }

  async function sendConfirmation(user: Pick<User, 'id' | 'name' | 'email'>) {
    const token = await issueToken(user.id, 'EMAIL_CONFIRMATION');
    await sendSafely('confirmation', confirmationEmail(user.email, user.name, token));
  }

  return {
    // A resposta é sempre a mesma, exista ou não a conta (DEC-025).
    async signup(input: SignupInput): Promise<void> {
      // O hash vem antes da busca para os dois caminhos levarem o mesmo tempo.
      const passwordHash = await hashPassword(input.password);
      const existing = await prisma.user.findUnique({ where: { email: input.email } });

      if (existing) {
        // Conta não confirmada: reenvia a confirmação sem alterar nome nem senha.
        if (!existing.emailConfirmedAt) await sendConfirmation(existing);
        else await sendSafely('account-exists', accountExistsEmail(existing.email));
        return;
      }

      let user: User;
      try {
        user = await prisma.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            hasPatientProfile: input.profiles.patient,
            hasTherapistProfile: input.profiles.therapist,
          },
        });
      } catch (err) {
        // Dois cadastros simultâneos com o mesmo e-mail: o segundo cai aqui e segue em silêncio.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }

      await sendConfirmation(user);
    },

    async confirmEmail(token: string): Promise<void> {
      await prisma.$transaction(async (tx) => {
        const { userId, now } = await consumeToken(tx, token, 'EMAIL_CONFIRMATION');
        await tx.user.updateMany({
          where: { id: userId, emailConfirmedAt: null },
          data: { emailConfirmedAt: now },
        });
      });
    },

    async resendConfirmation(email: string): Promise<void> {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user && !user.emailConfirmedAt) await sendConfirmation(user);
    },

    async login(input: LoginInput): Promise<User> {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      const valid = await verifyPassword(input.password, user?.passwordHash);

      if (!user || !valid) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha não conferem.');
      }
      // Só chega aqui quem acertou a senha, então dizer que falta confirmar não expõe nada.
      if (!user.emailConfirmedAt) {
        throw new AppError(
          403,
          'EMAIL_NOT_CONFIRMED',
          'Falta confirmar seu e-mail. Procure a mensagem do Faísca na sua caixa de entrada.',
        );
      }
      return user;
    },

    async forgotPassword(email: string): Promise<void> {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return;
      const token = await issueToken(user.id, 'PASSWORD_RESET');
      await sendSafely('password-reset', passwordResetEmail(user.email, user.name, token));
    },

    // Troca a senha e derruba todas as sessões abertas (sessionVersion + 1).
    // Quem abriu o link provou que é dono do e-mail, então o e-mail também fica confirmado.
    async resetPassword(input: ResetPasswordInput): Promise<void> {
      // O hash (lento) fica fora da transação para não segurar a conexão.
      const passwordHash = await hashPassword(input.password);

      await prisma.$transaction(async (tx) => {
        const { userId, now } = await consumeToken(tx, input.token, 'PASSWORD_RESET');
        await tx.user.update({
          where: { id: userId },
          data: { passwordHash, sessionVersion: { increment: 1 } },
        });
        await tx.user.updateMany({
          where: { id: userId, emailConfirmedAt: null },
          data: { emailConfirmedAt: now },
        });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
