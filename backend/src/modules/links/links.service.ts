import { AppError } from '../../errors/app-error.js';
import { Prisma, type LinkMethod, type ProfessionalKind, type SharedArea } from '../../generated/prisma/client.js';
import { formatLinkCode, generateLinkCode, hashLinkCode } from '../../lib/link-code.js';
import { logger } from '../../lib/logger.js';
import type { EmailMessage, Mailer } from '../../lib/mailer.js';
import { prisma } from '../../lib/prisma.js';
import { generateToken, hashToken } from '../../lib/secure-token.js';
import { countUnread } from '../read-marks/read-marks.service.js';
import { inviteEmail, linkCreatedEmail } from './links.emails.js';
import type { CreateInviteInput } from './links.schema.js';
import { avatarVersion } from '../profile/profile.service.js';

const MINUTE_MS = 60 * 1000;
const CODE_TTL_MS = 24 * 60 * MINUTE_MS;
// SPEC: 5 erros em 15 minutos bloqueiam temporariamente a terapeuta.
export const CODE_MAX_FAILURES = 5;
const CODE_FAILURE_WINDOW_MS = 15 * MINUTE_MS;

type Tx = Prisma.TransactionClient;

export type PatientLink = {
  id: string;
  method: LinkMethod;
  createdAt: string;
  // false = o paciente ainda não viu o aviso de novo vínculo.
  seen: boolean;
  // O tipo da profissional e as áreas que o paciente liberou para ela (DEC-097).
  kind: ProfessionalKind;
  sharedAreas: SharedArea[];
  // avatarVersion: se a profissional tem foto e quando mudou (DEC-061); a imagem vem de
  // /link/:linkId/avatar. O conselho (CRP ou CRM) é opcional.
  therapist: { name: string; email: string; avatarVersion: string | null; councilNumber: string | null };
};

export type PatientLinkStatus = {
  // Todos os vínculos ativos, a psicóloga primeiro (DEC-097).
  links: PatientLink[];
  // O primeiro da lista, para as telas de antes da DEC-097, que mostram um vínculo só.
  link: PatientLink | null;
  invite: { id: string; therapistEmail: string; createdAt: string } | null;
  // O código em si não volta: o banco só tem o hash. Serve para a tela dizer "você tem um código válido até...".
  code: { expiresAt: string } | null;
};

// avatarVersion (DEC-061): só se há foto e quando mudou; a imagem fica em /therapist/patients/:id/avatar.
export type LinkedPatient = { id: string; name: string; email: string; linkedAt: string; avatarVersion: string | null };
// Na lista de pacientes: quantos Pensamentos, Episódios e Ações a terapeuta ainda não leu
// (DEC-057), só nas áreas cujo aviso ela aceitou.
export type ListedPatient = LinkedPatient & { unreadCount: number };

// Já há uma profissional de cada tipo (DEC-097): não sobra vaga para um vínculo novo.
function alreadyLinked() {
  return new AppError(
    409,
    'LINK_ALREADY_ACTIVE',
    'Você já tem uma psicóloga e uma psiquiatra vinculadas. Para trocar, desfaça um dos vínculos.',
  );
}

const KIND_NAME: Record<ProfessionalKind, string> = { PSICOLOGIA: 'psicóloga', PSIQUIATRIA: 'psiquiatra' };

function invitePending() {
  return new AppError(409, 'INVITE_PENDING', 'Você tem um convite pendente. Cancele o convite para gerar outro ou um código.');
}

// O paciente já tem uma profissional do mesmo tipo (DEC-097), ou já está vinculado a esta.
function patientAlreadyLinked(kind: ProfessionalKind) {
  return new AppError(409, 'PATIENT_ALREADY_LINKED', `Esta pessoa já tem uma ${KIND_NAME[kind]} vinculada.`);
}

function alreadyLinkedToYou() {
  return new AppError(409, 'ALREADY_LINKED_TO_YOU', 'Você já acompanha esta pessoa.');
}

function linkIdRequired() {
  return new AppError(400, 'LINK_ID_REQUIRED', 'Escolha qual vínculo desfazer.');
}

function linkNotFound() {
  return new AppError(404, 'LINK_NOT_FOUND', 'Vínculo não encontrado.');
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

// Uma de cada tipo (DEC-097): com as duas vagas ocupadas, não há caminho para um vínculo novo.
async function hasAllKindsLinked(tx: Tx, patientId: string) {
  return (await tx.therapistLink.count({ where: { patientId, revokedAt: null } })) >= KINDS_COUNT;
}

const KINDS_COUNT = Object.keys(KIND_NAME).length;

async function hasPendingInvite(tx: Tx, patientId: string) {
  return (await tx.linkInvite.count({ where: { patientId, acceptedAt: null, canceledAt: null } })) > 0;
}

// Com as duas vagas ocupadas ou um convite pendente, o paciente não gera outro convite nem código
// (SPEC, DEC-097). Com só a psicóloga, dá para chamar a psiquiatra, e o contrário.
async function assertCanStartLink(tx: Tx, patientId: string) {
  if (await hasAllKindsLinked(tx, patientId)) throw alreadyLinked();
  if (await hasPendingInvite(tx, patientId)) throw invitePending();
}

// Um só caminho aberto por vez: um código novo ou um convite apagam os códigos não usados.
async function discardUnusedCodes(tx: Tx, patientId: string) {
  await tx.linkCode.deleteMany({ where: { patientId, usedAt: null } });
}

// O tipo vem da profissional, e o vínculo começa sem área nenhuma: o paciente escolhe o que ela vê
// (DEC-097). Os índices únicos parciais do banco garantem uma de cada tipo por paciente e uma vez
// cada profissional, mesmo com dois aceites ao mesmo tempo (DEC-031).
async function createLink(tx: Tx, patientId: string, therapistId: string, method: LinkMethod) {
  if (patientId === therapistId) throw selfLink();
  // Trava a conta da profissional: a troca de tipo (PATCH /profile) espera, e o vínculo não nasce com
  // um tipo que ela acabou de mudar (achado do revisor-seguranca).
  await lockUser(tx, therapistId);
  const therapist = await tx.user.findUniqueOrThrow({ where: { id: therapistId }, select: { professionalKind: true } });
  // O perfil de terapeuta sempre tem tipo (CHECK do banco); sem ele, não há como seguir.
  const kind = therapist.professionalKind;
  if (!kind) throw new Error('Profissional sem tipo');
  const mine = await tx.therapistLink.count({ where: { patientId, therapistId, revokedAt: null } });
  if (mine > 0) throw alreadyLinkedToYou();
  try {
    return await tx.therapistLink.create({ data: { patientId, therapistId, method, kind, sharedAreas: [] } });
  } catch (err) {
    if (isUniqueViolation(err)) throw patientAlreadyLinked(kind);
    throw err;
  }
}

type LinkWithTherapist = Prisma.TherapistLinkGetPayload<{ include: { therapist: { select: typeof therapistSelect } } }>;
const therapistSelect = {
  name: true,
  email: true,
  councilNumber: true,
  avatar: { select: { updatedAt: true } },
} as const;

function toPatientLink(link: LinkWithTherapist): PatientLink {
  return {
    id: link.id,
    method: link.method,
    createdAt: link.createdAt.toISOString(),
    seen: link.seenByPatientAt !== null,
    kind: link.kind,
    sharedAreas: link.sharedAreas,
    therapist: {
      name: link.therapist.name,
      email: link.therapist.email,
      avatarVersion: avatarVersion(link.therapist.avatar),
      councilNumber: link.therapist.councilNumber,
    },
  };
}

async function linkedPatient(linkId: string): Promise<LinkedPatient> {
  const link = await prisma.therapistLink.findUniqueOrThrow({
    where: { id: linkId },
    include: { patient: { select: { id: true, name: true, email: true, avatar: { select: { updatedAt: true } } } } },
  });
  const { avatar, ...patient } = link.patient;
  return { ...patient, linkedAt: link.createdAt.toISOString(), avatarVersion: avatarVersion(avatar) };
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
  async function acceptInviteTx(
    tx: Tx,
    where: Prisma.LinkInviteWhereUniqueInput,
    therapistId: string,
    kind?: ProfessionalKind,
  ) {
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

    // Quem ainda não tinha o perfil vira profissional do tipo escolhido no aceite (psicóloga, se não
    // disser). Quem já tinha fica com o tipo que tem (DEC-097).
    const user = await tx.user.findUniqueOrThrow({
      where: { id: therapistId },
      select: { hasTherapistProfile: true, professionalKind: true },
    });
    // Quem liga o perfil agora fica com o tipo que pediu agora, e não com um gravado antes.
    const professionalKind = user.hasTherapistProfile
      ? user.professionalKind
      : (kind ?? user.professionalKind ?? 'PSICOLOGIA');
    await tx.user.update({ where: { id: therapistId }, data: { hasTherapistProfile: true, professionalKind } });
    await discardUnusedCodes(tx, invite.patientId);
    return createLink(tx, invite.patientId, therapistId, 'INVITE');
  }

  return {
    // ——— Contexto de paciente (sempre o id da sessão) ———

    async status(patientId: string): Promise<PatientLinkStatus> {
      const [links, invite, code] = await Promise.all([
        prisma.therapistLink.findMany({
          where: { patientId, revokedAt: null },
          include: { therapist: { select: therapistSelect } },
          // PSICOLOGIA vem antes de PSIQUIATRIA na ordem do enum.
          orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }],
        }),
        prisma.linkInvite.findFirst({ where: { patientId, acceptedAt: null, canceledAt: null } }),
        prisma.linkCode.findFirst({
          where: { patientId, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      const list = links.map(toPatientLink);
      return {
        links: list,
        link: list[0] ?? null,
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

    // O acesso cai na hora: as rotas da profissional conferem o vínculo ativo a cada requisição.
    // Com mais de um vínculo, precisa dizer qual (DEC-097); sem linkId e com um só, desfaz ele (as
    // telas de antes da DEC-097 não mandam o id). Desfazer um não mexe nos outros.
    async revoke(patientId: string, linkId?: string): Promise<boolean> {
      if (!linkId) {
        const active = await prisma.therapistLink.findMany({ where: { patientId, revokedAt: null }, select: { id: true } });
        if (active.length > 1) throw linkIdRequired();
        if (active.length === 0) return false;
        linkId = active[0]!.id;
      }
      const { count } = await prisma.therapistLink.updateMany({
        where: { id: linkId, patientId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return count > 0;
    },

    // O paciente escolhe o que cada profissional vê (DEC-097). Vale na hora: as rotas da
    // profissional leem as áreas a cada requisição. Vínculo de outra pessoa ou desfeito é 404.
    async setSharedAreas(patientId: string, linkId: string, areas: SharedArea[]): Promise<PatientLink> {
      const { count } = await prisma.therapistLink.updateMany({
        where: { id: linkId, patientId, revokedAt: null },
        data: { sharedAreas: areas },
      });
      if (count === 0) throw linkNotFound();
      return toPatientLink(
        await prisma.therapistLink.findUniqueOrThrow({
          where: { id: linkId },
          include: { therapist: { select: therapistSelect } },
        }),
      );
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

    async acceptInvite(therapistId: string, token: string, kind?: ProfessionalKind) {
      const link = await prisma.$transaction((tx) =>
        acceptInviteTx(tx, { tokenHash: hashToken(token) }, therapistId, kind),
      );
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
    async listPatients(therapistId: string, privacyVersion: string | null): Promise<ListedPatient[]> {
      const links = await prisma.therapistLink.findMany({
        where: { therapistId, revokedAt: null },
        include: {
          patient: { select: { id: true, name: true, email: true, avatar: { select: { updatedAt: true } } } },
        },
        orderBy: { patient: { name: 'asc' } },
      });
      // Cada paciente conta só as áreas que liberou para esta profissional (DEC-097).
      const unread = await countUnread(
        therapistId,
        links.map((link) => ({ id: link.patient.id, sharedAreas: link.sharedAreas })),
        privacyVersion,
      );
      return links.map(({ patient: { avatar, ...patient }, createdAt }) => ({
        ...patient,
        linkedAt: createdAt.toISOString(),
        avatarVersion: avatarVersion(avatar),
        unreadCount: unread.get(patient.id) ?? 0,
      }));
    },
  };
}

export type LinksService = ReturnType<typeof createLinksService>;
