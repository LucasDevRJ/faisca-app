import { AppError } from '../../errors/app-error.js';
import { Prisma, type AuthTokenType, type Palette, type User } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateToken, hashToken } from '../../lib/secure-token.js';
import type { LinksService } from '../links/links.service.js';
import { accountDeletedEmail, accountExistsEmail, confirmationEmail, passwordResetEmail } from './auth.emails.js';
import type { AddProfileInput, LoginInput, ResetPasswordInput, SignupInput } from './auth.schema.js';
import { CURRENT_ANNOUNCEMENT, pendingAnnouncement, type Announcement } from './announcements.js';
import { PRIVACY_VERSION, privacyAreas, type PrivacyArea } from './privacy.js';

// A versão atual do aviso e as áreas que dependem dele ficam em ./privacy.ts (DEC-042).
export { PRIVACY_VERSION };

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
  // Aceitou a versão atual do aviso? Serve para a faixa "o aviso mudou" no app.
  privacyUpToDate: boolean;
  // Áreas liberadas pela versão aceita (DEC-042). Sem a delas, o RPD e os episódios de tensão
  // ficam bloqueados; o resto do app funciona.
  privacyAreas: Record<PrivacyArea, boolean>;
  // Novidade que a pessoa ainda não viu, para o card de Novidades; null quando não há (DEC-054).
  pendingAnnouncement: Announcement | null;
  // Paleta de cores da conta (DEC-063): vem no /auth/me para o app aplicar as cores ao abrir.
  palette: Palette;
};

export function toPublicUser(
  user: Pick<
    User,
    'id' | 'name' | 'email' | 'hasPatientProfile' | 'hasTherapistProfile' | 'privacyVersion' | 'seenAnnouncement' | 'palette'
  >,
): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profiles: { patient: user.hasPatientProfile, therapist: user.hasTherapistProfile },
    privacyUpToDate: user.privacyVersion === PRIVACY_VERSION,
    privacyAreas: privacyAreas(user.privacyVersion),
    pendingAnnouncement: pendingAnnouncement(user.seenAnnouncement, {
      patient: user.hasPatientProfile,
      therapist: user.hasTherapistProfile,
    }),
    palette: user.palette ?? 'SALVIA',
  };
}

function invalidToken() {
  return new AppError(400, 'INVALID_TOKEN', 'Este link é inválido, já foi usado ou expirou.');
}

// O cadastro já com a senha trocada pelo hash (DEC-073).
type PreparedSignup = Omit<SignupInput, 'password'> & { passwordHash: string };

// Os dados de um cadastro, guardados no link de confirmação que ele gerou (DEC-072).
type PendingSignup = { passwordHash: string; name: string; patient: boolean; therapist: boolean };

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

  // Um token novo invalida os anteriores do mesmo tipo que ainda não foram usados. Exceção: a
  // confirmação de e-mail (DEC-072). Cada cadastro tem o próprio link, com os próprios dados, e
  // um cadastro de outra pessoa com o mesmo e-mail não pode invalidar o link da dona.
  async function issueToken(userId: string, type: AuthTokenType, pending?: PendingSignup): Promise<string> {
    const token = generateToken();
    await prisma.$transaction([
      prisma.authToken.deleteMany({
        where:
          type === 'EMAIL_CONFIRMATION'
            ? // Só os vencidos: não guardar hash de senha nem nome além do prazo do link.
              { userId, type, usedAt: null, expiresAt: { lte: new Date() } }
            : { userId, type, usedAt: null },
      }),
      prisma.authToken.create({
        data: {
          userId,
          type,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
          pendingPasswordHash: pending?.passwordHash,
          pendingName: pending?.name,
          pendingPatient: pending?.patient,
          pendingTherapist: pending?.therapist,
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
    const row = await tx.authToken.findUniqueOrThrow({ where: { tokenHash } });
    return { userId: row.userId, now, row };
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

  // pending: os dados do cadastro que pediu este link. Sem eles (reenvio), o link copia os do
  // cadastro pendente mais recente: ele só confirma com a senha daquele cadastro (DEC-072), então
  // não importa de quem seja. Sem nenhum cadastro pendente válido, não manda nada (quem pediu
  // refaz o cadastro).
  async function sendConfirmation(user: Pick<User, 'id' | 'name' | 'email'>, pending?: PendingSignup) {
    let data = pending;
    if (!data) {
      const latest = await prisma.authToken.findFirst({
        where: {
          userId: user.id,
          type: 'EMAIL_CONFIRMATION',
          usedAt: null,
          expiresAt: { gt: new Date() },
          pendingPasswordHash: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!latest) return;
      data = {
        passwordHash: latest.pendingPasswordHash!,
        name: latest.pendingName!,
        patient: latest.pendingPatient!,
        therapist: latest.pendingTherapist!,
      };
    }
    const token = await issueToken(user.id, 'EMAIL_CONFIRMATION', data);
    await sendSafely('confirmation', confirmationEmail(user.email, data?.name ?? user.name, token));
  }

  return {
    // A resposta é sempre a mesma, exista ou não a conta (DEC-025).
    // O hash da senha, antes da resposta (DEC-073): sempre acontece, exista a conta ou não, então
    // não muda o tempo; e assim a parte que ocupa a CPU não entra na fila do trabalho depois da
    // resposta, que fica só com banco e e-mail.
    async prepareSignup({ password, ...input }: SignupInput): Promise<PreparedSignup> {
      return { ...input, passwordHash: await hashPassword(password) };
    },

    // A resposta é sempre a mesma, exista ou não a conta (DEC-025). Roda depois da resposta (DEC-073).
    async signup(input: PreparedSignup): Promise<void> {
      const { passwordHash } = input;
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      const pending: PendingSignup = {
        passwordHash,
        name: input.name,
        patient: input.profiles.patient,
        therapist: input.profiles.therapist,
      };

      if (existing) {
        // Conta não confirmada: manda um link com os dados DESTE cadastro, sem mexer na conta.
        // Quem confirma decide qual cadastro vale (DEC-072): alguém que se cadastrou antes com o
        // e-mail de outra pessoa não fica com a conta dela.
        // Conta confirmada que veio por convite: entra e aceita pela tela do convite.
        if (!existing.emailConfirmedAt) {
          // Quem refaz o cadastro aceitou o aviso de novo: guarda o aceite mais recente.
          await prisma.user.update({
            where: { id: existing.id },
            data: { privacyAcceptedAt: new Date(), privacyVersion: PRIVACY_VERSION },
          });
          await attachInvite(existing.id, input.inviteToken);
          await sendConfirmation(existing, pending);
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
            // Conta nova já conhece o app como ele está: a novidade atual não é novidade para ela.
            seenAnnouncement: CURRENT_ANNOUNCEMENT,
          },
        });
      } catch (err) {
        // Dois cadastros simultâneos com o mesmo e-mail: o segundo cai aqui e segue em silêncio.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
        throw err;
      }

      await attachInvite(user.id, input.inviteToken);
      await sendConfirmation(user, pending);
    },

    // Confirmar aplica os dados do cadastro que gerou o link (DEC-072), derruba qualquer sessão
    // anterior e invalida os outros links de confirmação. Conta já confirmada não muda: um link
    // antigo usado depois não troca a senha de ninguém.
    async confirmEmail(token: string, password: string): Promise<void> {
      // A senha precisa ser a do cadastro que gerou o link (DEC-072): o link de outra pessoa com o
      // mesmo e-mail só confirma com a senha dela. Conferida antes de usar o link, para um erro de
      // digitação não gastá-lo. Link sem os dados do cadastro (de antes da DEC-072) confere com a
      // senha da conta.
      const pendingRow = await prisma.authToken.findFirst({
        where: { tokenHash: hashToken(token), type: 'EMAIL_CONFIRMATION', usedAt: null, expiresAt: { gt: new Date() } },
        include: { user: { select: { passwordHash: true } } },
      });
      if (!pendingRow) throw invalidToken();
      if (!(await verifyPassword(password, pendingRow.pendingPasswordHash ?? pendingRow.user.passwordHash))) {
        throw new AppError(
          400,
          'WRONG_SIGNUP_PASSWORD',
          'A senha não confere com a deste cadastro. Use o link do e-mail do seu cadastro mais recente ou faça o cadastro de novo.',
        );
      }

      const userId = await prisma.$transaction(async (tx) => {
        // A conta primeiro: dois links diferentes clicados juntos esperam a vez, sem deadlock.
        const pending = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { userId: true } });
        if (pending) await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${pending.userId}::uuid FOR UPDATE`;
        const { userId, now, row } = await consumeToken(tx, token, 'EMAIL_CONFIRMATION');
        const { count } = await tx.user.updateMany({
          where: { id: userId, emailConfirmedAt: null },
          data: {
            emailConfirmedAt: now,
            sessionVersion: { increment: 1 },
            ...(row.pendingPasswordHash && {
              passwordHash: row.pendingPasswordHash,
              name: row.pendingName!,
              hasPatientProfile: row.pendingPatient!,
              hasTherapistProfile: row.pendingTherapist!,
            }),
          },
        });
        if (count > 0) {
          await tx.authToken.deleteMany({ where: { userId, type: 'EMAIL_CONFIRMATION', usedAt: null } });
        }
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

    // Card de Novidades (DEC-054): a pessoa tocou em "Entendi" na novidade atual.
    async markAnnouncementSeen(userId: string, announcement: Announcement): Promise<User> {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const pending = pendingAnnouncement(user.seenAnnouncement, {
        patient: user.hasPatientProfile,
        therapist: user.hasTherapistProfile,
      });
      // Só a novidade que está aparecendo para a pessoa: uma aba antiga, com outra, não esconde a atual.
      if (announcement !== pending) {
        throw new AppError(400, 'ANNOUNCEMENT_NOT_PENDING', 'Esta novidade não está mais valendo.');
      }
      return prisma.user.update({ where: { id: userId }, data: { seenAnnouncement: announcement } });
    },

    // SPEC ("Privacidade"), DEC-035: apaga a conta e, em cascata no banco, atividades, consultas,
    // vínculos, convites, códigos, tokens e o Registro de Pensamentos. As sessões abertas caem porque o requireAuth não
    // acha mais o usuário. O id fica na lista de contas excluídas (DEC-076), para a conta não voltar
    // se uma cópia de segurança for restaurada.
    async deleteAccount(userId: string, password: string): Promise<void> {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      if (!(await verifyPassword(password, user.passwordHash))) {
        throw new AppError(400, 'INVALID_PASSWORD', 'A senha não confere.');
      }
      await prisma.$transaction(async (tx) => {
        // deleteMany: se dois pedidos chegarem juntos, o segundo não apaga nada e não quebra.
        const { count } = await tx.user.deleteMany({ where: { id: userId } });
        if (count > 0) await tx.deletedAccount.create({ data: { userId } });
      });
      // O userId fica no log de propósito: se o banco sumir, é por ele que as contas excluídas depois
      // da última cópia são apagadas de novo na restauração (DEC-076). Não mascarar.
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
        const { count } = await tx.user.updateMany({
          where: { id: userId, emailConfirmedAt: null },
          data: { emailConfirmedAt: now },
        });
        // Confirmou agora: os links de confirmação pendentes, com dados de cadastro, não servem
        // mais e não devem ficar guardados (DEC-072).
        if (count > 0) {
          await tx.authToken.deleteMany({ where: { userId, type: 'EMAIL_CONFIRMATION', usedAt: null } });
        }
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
