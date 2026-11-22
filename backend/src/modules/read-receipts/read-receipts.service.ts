import { AppError } from '../../errors/app-error.js';
import type { ProfessionalKind, SharedArea } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import { READ_TYPES, type ReadType } from '../read-marks/read-marks.schema.js';
import { readStatusOf } from '../read-marks/read-marks.service.js';

// "Lido" para o paciente (SPEC, "Lido para o paciente"; DEC-117). A marca de leitura continua sendo
// da profissional (DEC-057): aqui o paciente só a vê quando os dois ligaram, cada um no próprio lado.
// O paciente pede; a profissional ativa ou responde "Agora não". O paciente nunca vê a recusa: para
// ele, "Agora não" e "ainda não respondeu" são o mesmo "Pedido enviado".

type ReadReceiptsColumns = {
  readReceiptsRequestedAt: Date | null;
  readReceiptsSharedAt: Date | null;
  readReceiptsNotNowAt: Date | null;
};

// O que o paciente vê do pedido dele: desligado, pedido enviado ou ativo.
export type PatientReadReceipts = 'OFF' | 'REQUESTED' | 'ON';
// O que a profissional vê: sem pedido, pedido esperando resposta, "Agora não" ou ativo.
export type ProfessionalReadReceipts = 'OFF' | 'PENDING' | 'NOT_NOW' | 'ON';

export function patientReadReceipts(link: ReadReceiptsColumns): PatientReadReceipts {
  if (!link.readReceiptsRequestedAt) return 'OFF';
  return link.readReceiptsSharedAt ? 'ON' : 'REQUESTED';
}

export function professionalReadReceipts(link: ReadReceiptsColumns): ProfessionalReadReceipts {
  if (!link.readReceiptsRequestedAt) return 'OFF';
  if (link.readReceiptsSharedAt) return 'ON';
  return link.readReceiptsNotNowAt ? 'NOT_NOW' : 'PENDING';
}

// Para cada tipo do "Lido": a área do aviso de privacidade e a área que o paciente libera para a
// profissional (DEC-097). Mesmo mapa do read-marks.service; repetido aqui para não mexer nele.
const AREA: Record<ReadType, { privacy: PrivacyArea; shared: SharedArea }> = {
  THOUGHT_RECORD: { privacy: 'thoughtRecords', shared: 'THOUGHT_RECORDS' },
  TENSION_EPISODE: { privacy: 'tensionEpisodes', shared: 'TENSION_EPISODES' },
  ACTION: { privacy: 'actions', shared: 'ACTIONS' },
  ABOUT_ME: { privacy: 'aboutMe', shared: 'ABOUT_ME' },
  PLAN_ENTRY: { privacy: 'plans', shared: 'PLANS' },
  TASK: { privacy: 'tasks', shared: 'TASKS' },
};

export type ReadReceipt = { type: ReadType; id: string; readAt: string; kind: ProfessionalKind };

function linkNotFound() {
  return new AppError(404, 'LINK_NOT_FOUND', 'Vínculo não encontrado.');
}

function notRequested() {
  return new AppError(409, 'READ_RECEIPTS_NOT_REQUESTED', 'Esta pessoa não pediu para ver as suas leituras.');
}

const record = { select: { id: true, userId: true, updatedAt: true } } as const;

export function createReadReceiptsService() {
  return {
    // ——— Contexto de paciente (sempre o id da sessão) ———

    // Liga ou desliga o pedido para uma profissional. Ligar de novo não mexe num pedido que já existe;
    // desligar zera os dois lados, e um pedido novo volta a esperar a resposta dela.
    async setRequested(patientId: string, linkId: string, requested: boolean) {
      const where = { id: linkId, patientId, revokedAt: null };
      if (requested) {
        await prisma.therapistLink.updateMany({
          where: { ...where, readReceiptsRequestedAt: null },
          data: { readReceiptsRequestedAt: new Date() },
        });
      } else {
        await prisma.therapistLink.updateMany({
          where,
          data: { readReceiptsRequestedAt: null, readReceiptsSharedAt: null, readReceiptsNotNowAt: null },
        });
      }
      const link = await prisma.therapistLink.findFirst({ where });
      if (!link) throw linkNotFound();
      return { readReceipts: patientReadReceipts(link) };
    },

    // As leituras que o paciente pode ver: só das profissionais com os dois lados ligados, só das
    // áreas que ele libera hoje para cada uma e que o aceite dela cobre, e só as marcas em dia (LIDO).
    // Um registro que mudou depois da leitura não mostra nada até ela ler de novo. A resposta diz o
    // tipo da profissional, nunca quem é.
    async list(patientId: string): Promise<{ receipts: ReadReceipt[] }> {
      const links = await prisma.therapistLink.findMany({
        where: {
          patientId,
          revokedAt: null,
          readReceiptsRequestedAt: { not: null },
          readReceiptsSharedAt: { not: null },
        },
        select: { therapistId: true, kind: true, sharedAreas: true, createdAt: true, therapist: { select: { privacyVersion: true } } },
      });

      const receipts: ReadReceipt[] = [];
      for (const link of links) {
        const version = link.therapist.privacyVersion;
        if (!coversArea(version, 'readReceipts')) continue;
        const types = new Set(
          READ_TYPES.filter(
            (type) => coversArea(version, AREA[type].privacy) && link.sharedAreas.includes(AREA[type].shared),
          ),
        );
        if (types.size === 0) continue;

        const marks = await prisma.readMark.findMany({
          // Só as leituras do vínculo atual: um vínculo desfeito e refeito começa sem leituras visíveis.
          where: { therapistId: link.therapistId, patientId, readAt: { gte: link.createdAt } },
          select: {
            readAt: true,
            thoughtRecord: record,
            tensionEpisode: record,
            action: record,
            about: record,
            planEntry: record,
            task: { select: { id: true, userId: true, updatedAt: true, respondedAt: true } },
          },
        });
        for (const mark of marks) {
          const found: [ReadType, { id: string; userId: string; updatedAt: Date } | null][] = [
            ['THOUGHT_RECORD', mark.thoughtRecord],
            ['TENSION_EPISODE', mark.tensionEpisode],
            ['ACTION', mark.action],
            ['ABOUT_ME', mark.about],
            ['PLAN_ENTRY', mark.planEntry],
            // Como no "Para ler": a Tarefa só conta depois de respondida.
            ['TASK', mark.task?.respondedAt ? mark.task : null],
          ];
          const hit = found.find(([, value]) => value !== null);
          if (!hit) continue;
          const [type, value] = hit;
          // Segunda conferência do dono: a marca já nasce só para registros do paciente (DEC-057).
          if (!value || value.userId !== patientId || !types.has(type)) continue;
          if (readStatusOf(mark.readAt, value.updatedAt) !== 'LIDO') continue;
          receipts.push({ type, id: value.id, readAt: mark.readAt.toISOString(), kind: link.kind });
        }
      }
      return { receipts };
    },

    // ——— Contexto de profissional (vínculo conferido pelo requireActiveLink) ———

    // Ativa (true) ou "Agora não"/desliga (false). Só responde a um pedido que existe: sem pedido, 409.
    // Grava só a preferência dela no vínculo, nunca dado do paciente (exceção da regra 1, DEC-117).
    async setShared(linkId: string, shared: boolean) {
      const { count } = await prisma.therapistLink.updateMany({
        where: { id: linkId, revokedAt: null, readReceiptsRequestedAt: { not: null } },
        data: shared
          ? { readReceiptsSharedAt: new Date(), readReceiptsNotNowAt: null }
          : { readReceiptsSharedAt: null, readReceiptsNotNowAt: new Date() },
      });
      if (count === 0) throw notRequested();
      const link = await prisma.therapistLink.findUniqueOrThrow({ where: { id: linkId } });
      return { readReceipts: professionalReadReceipts(link) };
    },
  };
}

export type ReadReceiptsService = ReturnType<typeof createReadReceiptsService>;
