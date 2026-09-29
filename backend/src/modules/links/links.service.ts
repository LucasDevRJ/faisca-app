import { AppError } from '../../errors/app-error.js';
import { Prisma, type LinkMethod } from '../../generated/prisma/client.js';
import { formatLinkCode, generateLinkCode, hashLinkCode } from '../../lib/link-code.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { generateToken, hashToken } from '../../lib/secure-token.js';
import { inviteEmail, linkCreatedEmail } from './links.emails.js';
import type { CreateInviteInput } from './links.schema.js';

const MINUTE_MS = 60 * 1000;
const CODE_TTL_MS = 24 * 60 * MINUTE_MS;
// SPEC: 5 erros em 15 minutos bloqueiam temporariamente a terapeuta.
export const CODE_MAX_FAILURES = 5;
const CODE_FAILURE_WINDOW_MS = 15 * MINUTE_MS;

type Tx = Prisma.TransactionClient;

export type PatientLinkStatus = {
  link: {
    id: string;
    method: LinkMethod;
    createdAt: string;
    // false = o paciente ainda não viu o aviso de novo vínculo.
    seen: boolean;
    therapist: { name: string; email: string };
  } | null;
  invite: { id: string; therapistEmail: string; createdAt: string } | null;
  // O código em si não volta: o banco só tem o hash. Serve para a tela dizer "você tem um código válido até...".
  code: { expiresAt: string } | null;
};

export type LinkedPatient = { id: string; name: string; email: string; linkedAt: string };

function alreadyLinked() {
  return new AppError(409, 'LINK_ALREADY_ACTIVE', 'Você já tem uma terapeuta vinculada. Para trocar, desfaça o vínculo atual.');
}

function invitePending() {
  return new AppError(409, 'INVITE_PENDING', 'Você tem um convite pendente. Cancele o convite para gerar outro ou um código.');
}

// O paciente já se vinculou a outra pessoa entre o convite (ou código) e o aceite.
function patientAlreadyLinked() {
  return new AppError(409, 'PATIENT_ALREADY_LINKED', 'Esta pessoa já tem uma terapeuta vinculada.');
}

function selfLink() {
  return new AppError(400, 'SELF_LINK', 'Não dá para se vincular à própria conta.');
}

function invalidInvite() {
  return new AppError(400, 'INVALID_TOKEN', 'Este convite é inválido, já foi usado ou foi cancelado.');
}

function invalidCode() {
  return new AppError(400, 'INVALID_CODE', 'Código inválido ou expirado. Confira com quem enviou.');
}

function blocked() {
  return new AppError(
    429,
    'TOO_MANY_REQUESTS',
    'Muitas tentativas seguidas. Respire um pouco e tente de novo daqui a alguns minutos.',
  );
}

function isUniqueViolation(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// Trava a linha do usuário até o fim da transação. Serializa as operações de vínculo de uma
// mesma pessoa (gerar código, convidar, contar tentativas), fechando a janela entre ler e gravar.
async function lockUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
}

async function hasActiveLink(tx: Tx, patientId: string) {
  return (await tx.therapistLink.count({ where: { patientId, revokedAt: null } })) > 0;
}

async function hasPendingInvite(tx: Tx, patientId: string) {
  return (await tx.linkInvite.count({ where: { patientId, acceptedAt: null, canceledAt: null } })) > 0;
}

// Com um vínculo ativo ou convite pendente, o paciente não gera outro convite nem código (SPEC).
async function assertCanStartLink(tx: Tx, patientId: string) {
  if (await hasActiveLink(tx, patientId)) throw alreadyLinked();
  if (await hasPendingInvite(tx, patientId)) throw invitePending();
}

// Um só caminho aberto por vez: um código novo ou um convite apagam os códigos não usados.
async function discardUnusedCodes(tx: Tx, patientId: string) {
  await tx.linkCode.deleteMany({ where: { patientId, usedAt: null } });
}

// O índice único parcial do banco garante um vínculo ativo por paciente, mesmo com dois
// aceites ao mesmo tempo (DEC-031).
async function createLink(tx: Tx, patientId: string, therapistId: string, method: LinkMethod) {
  if (patientId === therapistId) throw selfLink();
  try {
    return await tx.therapistLink.create({ data: { patientId, therapistId, method } });
  } catch (err) {
    if (isUniqueViolation(err)) throw patientAlreadyLinked();
    throw err;
  }
}

async function linkedPatient(linkId: string): Promise<LinkedPatient> {
  const link = await prisma.therapistLink.findUniqueOrThrow({
    where: { id: linkId },
    include: { patient: { select: { id: true, name: true, email: true } } },
  });
  return { ...link.patient, linkedAt: link.createdAt.toISOString() };
}

export function createLinksService(mailer: Mailer) {
  // Falha no envio não desfaz o vínculo nem o convite. O log leva só o tipo, nunca o destinatário.
  async function sendSafely(kind: string, message: EmailMessage) {
    try {
      await mailer.send(message);
    } catch (err) {
      logger.error({ err, emailKind: kind }, 'Falha ao enviar e-mail');
    }
  }

  async function notifyPatient(linkId: string) {
    const link = await prisma.therapistLink.findUniqueOrThrow({
      where: { id: linkId },
      include: { patient: true, therapist: true },
    });
    await sendSafely(
      'link-created',
      linkCreatedEmail(link.patient.email, link.patient.name, {
        name: link.therapist.name,
        email: link.therapist.email,
      }),
    );
  }

  // Aceita o convite em nome de `therapistId`. Ativa o perfil de terapeuta se faltar (SPEC).
  async function acceptInviteTx(tx: Tx, where: Prisma.LinkInviteWhereUniqueInput, therapistId: string) {
    const invite = await tx.linkInvite.findUnique({ where });
    if (!invite || invite.acceptedAt || invite.canceledAt) throw invalidInvite();
    // Antes de consumir: o próprio paciente abrir o link não gasta o convite.
    if (invite.patientId === therapistId) throw selfLink();

    // UPDATE condicional: dois aceites ao mesmo tempo não passam os dois.
    const { count } = await tx.linkInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, canceledAt: null },
      data: { acceptedAt: new Date() },
    });
    if (count === 0) throw invalidInvite();

    await tx.user.update({ where: { id: therapistId }, data: { hasTherapistProfile: true } });
    await discardUnusedCodes(tx, invite.patientId);
    return createLink(tx, invite.patientId, therapistId, 'INVITE');
  }

  return {
    // ——— Contexto de paciente (sempre o id da sessão) ———

    async status(patientId: string): Promise<PatientLinkStatus> {
      const [link, invite, code] = await Promise.all([
        prisma.therapistLink.findFirst({
          where: { patientId, revokedAt: null },
          include: { therapist: { select: { name: true, email: true } } },
        }),
        prisma.linkInvite.findFirst({ where: { patientId, acceptedAt: null, canceledAt: null } }),
        prisma.linkCode.findFirst({
          where: { patientId, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      return {
        link: link && {
          id: link.id,
          method: link.method,
          createdAt: link.createdAt.toISOString(),
          seen: link.seenByPatientAt !== null,
          therapist: link.therapist,
        },
        invite: invite && {
          id: invite.id,
          therapistEmail: invite.therapistEmail,
          createdAt: invite.createdAt.toISOString(),
        },
        code: code && { expiresAt: code.expiresAt.toISOString() },
      };
    },

    async createInvite(patient: { id: string; name: string; email: string }, input: CreateInviteInput) {
      // Aviso de interface: quem aceita pode usar qualquer conta, e o bloqueio de verdade é no aceite.
      if (input.email === patient.email) throw selfLink();

      const token = generateToken();
      const invite = await prisma.$transaction(async (tx) => {
        await lockUser(tx, patient.id);
        await assertCanStartLink(tx, patient.id);
        await discardUnusedCodes(tx, patient.id);
        return tx.linkInvite.create({
          data: { patientId: patient.id, therapistEmail: input.email, tokenHash: hashToken(token) },
        });
      });

      await sendSafely('link-invite', inviteEmail(input.email, patient.name, token));
      return { id: invite.id, therapistEmail: invite.therapistEmail, createdAt: invite.createdAt.toISOString() };
    },

    // false = não havia convite pendente.
    async cancelInvite(patientId: string): Promise<boolean> {
      const { count } = await prisma.linkInvite.updateMany({
        where: { patientId, acceptedAt: null, canceledAt: null },
        data: { canceledAt: new Date() },
      });
      return count > 0;
    },

    async generateCode(patientId: string) {
      const code = generateLinkCode();
      const expiresAt = new Date(Date.now() + CODE_TTL_MS);
      await prisma.$transaction(async (tx) => {
        await lockUser(tx, patientId);
        await assertCanStartLink(tx, patientId);
        // Gerar um novo invalida o anterior (SPEC).
        await discardUnusedCodes(tx, patientId);
        await tx.linkCode.create({ data: { patientId, codeHash: hashLinkCode(code), expiresAt } });
      });
      // O único momento em que o código existe em texto: vai na resposta e não é guardado.
      return { code: formatLinkCode(code), expiresAt: expiresAt.toISOString() };
    },

    // O acesso cai na hora: as rotas da terapeuta conferem o vínculo ativo a cada requisição.
    async revoke(patientId: string): Promise<boolean> {
      const { count } = await prisma.therapistLink.updateMany({
        where: { patientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return count > 0;
    },

    async markSeen(patientId: string): Promise<void> {
      await prisma.therapistLink.updateMany({
        where: { patientId, revokedAt: null, seenByPatientAt: null },
        data: { seenByPatientAt: new Date() },
      });
    },

    // ——— Contexto de terapeuta ———

    async redeemCode(therapistId: string, code: string) {
      const codeHash = hashLinkCode(code);

      // A tentativa errada precisa ser gravada, então a transação devolve o resultado em vez
      // de lançar erro (um erro desfaria o INSERT da tentativa).
      const result = await prisma.$transaction(async (tx) => {
        // Com a linha travada, duas tentativas simultâneas da mesma terapeuta contam uma de cada vez.
        await lockUser(tx, therapistId);
        const since = new Date(Date.now() - CODE_FAILURE_WINDOW_MS);
        await tx.linkCodeAttempt.deleteMany({ where: { therapistId, createdAt: { lt: since } } });
        const failures = await tx.linkCodeAttempt.count({ where: { therapistId } });
        // Bloqueada, nem o código certo passa: senão o bloqueio não freia quem tenta adivinhar.
        if (failures >= CODE_MAX_FAILURES) return { outcome: 'blocked' } as const;

        const now = new Date();
        const found = await tx.linkCode.findUnique({ where: { codeHash } });
        if (!found || found.usedAt || found.expiresAt <= now) {
          await tx.linkCodeAttempt.create({ data: { therapistId } });
          return { outcome: 'invalid' } as const;
        }
        // Antes de consumir: digitar o próprio código não gasta o código.
        if (found.patientId === therapistId) throw selfLink();

        const { count } = await tx.linkCode.updateMany({
          where: { id: found.id, usedAt: null },
          data: { usedAt: now },
        });
        if (count === 0) return { outcome: 'invalid' } as const;

        const link = await createLink(tx, found.patientId, therapistId, 'CODE');
        return { outcome: 'linked', linkId: link.id } as const;
      });

      if (result.outcome === 'blocked') throw blocked();
      if (result.outcome === 'invalid') throw invalidCode();
      await notifyPatient(result.linkId);
      return linkedPatient(result.linkId);
    },

    async acceptInvite(therapistId: string, token: string) {
      const link = await prisma.$transaction((tx) => acceptInviteTx(tx, { tokenHash: hashToken(token) }, therapistId));
      await notifyPatient(link.id);
      return linkedPatient(link.id);
    },

    // Chamado quando a conta criada pelo link do convite confirma o e-mail. Se o convite não
    // vale mais (cancelado, paciente já vinculado), a conta segue normal e nada é criado.
    async acceptInviteForNewAccount(userId: string): Promise<void> {
      const invite = await prisma.linkInvite.findFirst({
        where: { signupUserId: userId, acceptedAt: null, canceledAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!invite) return;
      try {
        const link = await prisma.$transaction((tx) => acceptInviteTx(tx, { id: invite.id }, userId));
        await notifyPatient(link.id);
      } catch (err) {
        if (err instanceof AppError) {
          logger.info({ errorCode: err.code }, 'Convite do cadastro não virou vínculo');
          return;
        }
        throw err;
      }
    },

    // Pacientes com vínculo ativo; os dados vêm da conta de cada um (SPEC, "Visão da terapeuta").
    async listPatients(therapistId: string): Promise<LinkedPatient[]> {
      const links = await prisma.therapistLink.findMany({
        where: { therapistId, revokedAt: null },
        include: { patient: { select: { id: true, name: true, email: true } } },
        orderBy: { patient: { name: 'asc' } },
      });
      return links.map((link) => ({ ...link.patient, linkedAt: link.createdAt.toISOString() }));
    },
  };
}

export type LinksService = ReturnType<typeof createLinksService>;
