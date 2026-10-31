import { AppError } from '../../errors/app-error.js';
import { Prisma, type TherapistNotice } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { NoticeBody } from './notices.schema.js';

// Mural de avisos da terapeuta (SPEC, "Mural de avisos"; DEC-079). É a terceira exceção da regra 1
// do AGENTS.md: a terapeuta escreve, mas só o próprio conteúdo, nunca dado de paciente. O paciente
// lê os avisos da terapeuta com vínculo ativo e marca o que já viu. Ninguém vê quem mais recebe nem
// quem leu.

function notFound() {
  return new AppError(404, 'NOTICE_NOT_FOUND', 'Aviso não encontrado.');
}

function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso a este aviso.');
}

function toPublicNotice(notice: TherapistNotice) {
  return {
    id: notice.id,
    body: notice.body,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  };
}

export type PublicNotice = ReturnType<typeof toPublicNotice>;

async function findOwned(therapistId: string, id: string): Promise<TherapistNotice> {
  const notice = await prisma.therapistNotice.findUnique({ where: { id } });
  if (!notice) throw notFound();
  if (notice.therapistId !== therapistId) throw forbidden();
  return notice;
}

// A terapeuta com vínculo ativo com o paciente; null sem vínculo. Um vínculo ativo por paciente
// (SPEC, "Vínculo paciente ↔ terapeuta").
async function activeTherapistOf(patientId: string): Promise<string | null> {
  const link = await prisma.therapistLink.findFirst({
    where: { patientId, revokedAt: null },
    select: { therapistId: true },
  });
  return link?.therapistId ?? null;
}

// Todos os avisos da terapeuta com vínculo ativo, inclusive os de antes do vínculo (DEC-079), do mais
// novo para o mais antigo, com o "já vi" do próprio paciente. Sem vínculo, nada.
async function listForPatient(patientId: string) {
  const therapistId = await activeTherapistOf(patientId);
  if (!therapistId) return { notices: [], unseenCount: 0 };

  const notices = await prisma.therapistNotice.findMany({
    where: { therapistId },
    orderBy: { createdAt: 'desc' },
    include: { seenBy: { where: { patientId }, select: { seenAt: true } } },
  });
  const result = notices.map(({ seenBy, ...notice }) => ({ ...toPublicNotice(notice), seen: seenBy.length > 0 }));
  return { notices: result, unseenCount: result.filter((notice) => !notice.seen).length };
}

export function createNoticesService() {
  return {
    // ——— Terapeuta: os próprios avisos ———

    async listOwn(therapistId: string) {
      const notices = await prisma.therapistNotice.findMany({
        where: { therapistId },
        orderBy: { createdAt: 'desc' },
      });
      return { notices: notices.map(toPublicNotice) };
    },

    async create(therapistId: string, input: NoticeBody) {
      const notice = await prisma.therapistNotice.create({ data: { therapistId, body: input.body } });
      // Só ids (regra 7): o texto não vai para o log.
      logger.info({ noticeId: notice.id, therapistId }, 'Aviso do mural publicado');
      return { notice: toPublicNotice(notice) };
    },

    // Editar não faz o aviso voltar a ser "novo" para quem já viu (DEC-079): o "já vi" continua.
    async update(therapistId: string, id: string, input: NoticeBody) {
      await findOwned(therapistId, id);
      const notice = await prisma.therapistNotice.update({ where: { id }, data: { body: input.body } });
      return { notice: toPublicNotice(notice) };
    },

    async remove(therapistId: string, id: string) {
      await findOwned(therapistId, id);
      await prisma.therapistNotice.delete({ where: { id } });
      logger.info({ noticeId: id, therapistId }, 'Aviso do mural apagado');
    },

    // ——— Paciente: os avisos da terapeuta com vínculo ativo ———

    listForPatient,

    // Marca como vistos. Um aviso que não é da terapeuta com vínculo ativo recusa o pedido inteiro
    // (403) e nada é gravado, como nas marcas de leitura (DEC-057). Marcar de novo não muda nada.
    async markSeen(patientId: string, ids: string[]) {
      const therapistId = await activeTherapistOf(patientId);
      const found = therapistId ? await prisma.therapistNotice.count({ where: { therapistId, id: { in: ids } } }) : 0;
      if (found !== ids.length) throw forbidden();

      try {
        await prisma.noticeSeen.createMany({
          data: ids.map((noticeId) => ({ noticeId, patientId })),
          skipDuplicates: true,
        });
      } catch (err) {
        // A terapeuta apagou um dos avisos entre a conferência e a gravação: a chave estrangeira
        // recusa, e a resposta é a mesma de um aviso de fora, e não um 500.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw forbidden();
        throw err;
      }
      return listForPatient(patientId);
    },
  };
}

export type NoticesService = ReturnType<typeof createNoticesService>;
