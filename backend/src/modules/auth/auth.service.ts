import { AppError } from '../../errors/app-error.js';
import { Prisma, type AuthTokenType, type User } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateToken, hashToken } from '../../lib/secure-token.js';
import type { LinksService } from '../links/links.service.js';
import { accountDeletedEmail, accountExistsEmail, confirmationEmail, passwordResetEmail } from './auth.emails.js';
import type { AddProfileInput, LoginInput, ResetPasswordInput, SignupInput } from './auth.schema.js';

// Versão do aviso de privacidade aceita no cadastro (DEC-036). Muda junto com o texto da página
// /privacidade no front (frontend/src/pages/privacy-page.tsx).
// 2026-10.2: entra o Registro de Pensamentos (DEC-039). Quem aceitou a anterior aceita de novo
// pelo POST /auth/accept-privacy para usar a área de RPD.
export const PRIVACY_VERSION = '2026-10.2';

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
  // Aceitou a versão atual do aviso? Sem isso, a área de RPD fica bloqueada (DEC-039).
  privacyUpToDate: boolean;
};

export function toPublicUser(
  user: Pick<User, 'id' | 'name' | 'email' | 'hasPatientProfile' | 'hasTherapistProfile' | 'privacyVersion'>,
): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profiles: { patient: user.hasPatientProfile, therapist: user.hasTherapistProfile },
    privacyUpToDate: user.privacyVersion === PRIVACY_VERSION,
  };
}

function invalidToken() {
  return new AppError(400, 'INVALID_TOKEN', 'Este link é inválido, já foi usado ou expirou.');
}

export function createAuthService(mailer: Mailer, links: LinksService) {
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

  // Guarda na conta nova qual convite ela veio aceitar. Token inválido é ignorado em silêncio:
  // o cadastro responde igual de qualquer jeito (DEC-025).
  async function attachInvite(userId: string, inviteToken: string | undefined) {
    if (!inviteToken) return;
    await prisma.linkInvite.updateMany({
      where: { tokenHash: hashToken(inviteToken), acceptedAt: null, canceledAt: null },
      data: { signupUserId: userId },
    });
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
        // Conta confirmada que veio por convite: entra e aceita pela tela do convite.
        if (!existing.emailConfirmedAt) {
          // Quem refaz o cadastro aceitou o aviso de novo: guarda o aceite mais recente.
          await prisma.user.update({
            where: { id: existing.id },
            data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION },
          });
          await attachInvite(existing.id, input.inviteToken);
          await sendConfirmation(existing);
        } else {
          await sendSafely('account-exists', accountExistsEmail(existing.email));
        }
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
            privacyAcceptedAt: new Date(),
            privacyVersion: PRIVACY_VERSION,
          },
        });
      } catch (err) {
        // Dois cadastros simultâneos com o mesmo e-mail: o segundo cai aqui e segue em silêncio.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }

      await attachInvite(user.id, input.inviteToken);
      await sendConfirmation(user);
    },

    async confirmEmail(token: string): Promise<void> {
      const userId = await prisma.$transaction(async (tx) => {
        const { userId, now } = await consumeToken(tx, token, 'EMAIL_CONFIRMATION');
        await tx.user.updateMany({
          where: { id: userId, emailConfirmedAt: null },
          data: { emailConfirmedAt: now },
        });
        return userId;
      });
      // Fora da transação: se o convite não vale mais, a confirmação continua valendo.
      await links.acceptInviteForNewAccount(userId);
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

    async addProfile(userId: string, input: AddProfileInput): Promise<User> {
      return prisma.user.update({
        where: { id: userId },
        data: input.profile === 'patient' ? { hasPatientProfile: true } : { hasTherapistProfile: true },
      });
    },

    // Novo aceite do aviso, para quem aceitou uma versão anterior (DEC-039). Grava a data e a
    // versão, como no cadastro (DEC-036).
    async acceptPrivacy(userId: string): Promise<User> {
      return prisma.user.update({
        where: { id: userId },
        data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION },
      });
    },

    // SPEC ("Privacidade"), DEC-035: apaga a conta e, em cascata no banco, atividades, consultas,
    // vínculos, convites, códigos, tokens e o Registro de Pensamentos. As sessões abertas caem porque o requireAuth não
    // acha mais o usuário.
    async deleteAccount(userId: string, password: string): Promise<void> {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AppError(400, 'INVALID_PASSWORD', 'A senha não confere.');
      }
      // deleteMany: se dois pedidos chegarem juntos, o segundo não quebra.
      await prisma.user.deleteMany({ where: { id: userId } });
      logger.info({ userId }, 'Conta excluída');
      await sendSafely('account-deleted', accountDeletedEmail(user.email, user.name));
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
