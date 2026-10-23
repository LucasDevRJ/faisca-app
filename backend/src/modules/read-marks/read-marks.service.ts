import { AppError } from '../../errors/app-error.js';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../lib/prisma.js';
import type { ActionsService } from '../actions/actions.service.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import type { TensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import type { ThoughtRecordsService } from '../thought-records/thought-records.service.js';
import { READ_TYPES, type ReadMarkItem, type ReadType } from './read-marks.schema.js';

// Marcas de leitura da terapeuta (SPEC, "Visão da terapeuta"; DEC-057). É a única escrita da
// terapeuta sobre os registros de um paciente (exceção da regra 1 do AGENTS.md), e nunca altera o
// registro: só a tabela ReadMark. O paciente não vê nada disso.

// NAO_LIDO: sem marca. LIDO: marcado depois da última mudança. ATUALIZADO: lido, mas o registro
// mudou depois (edição no dia, explicação alternativa, ação avaliada) e voltou a contar.
export type ReadStatus = 'NAO_LIDO' | 'LIDO' | 'ATUALIZADO';
export type ReadInfo = { readStatus: ReadStatus; readAt: string | null };

type Column = 'thoughtRecordId' | 'tensionEpisodeId' | 'actionId';

const AREA: Record<ReadType, { privacy: PrivacyArea; column: Column }> = {
  THOUGHT_RECORD: { privacy: 'thoughtRecords', column: 'thoughtRecordId' },
  TENSION_EPISODE: { privacy: 'tensionEpisodes', column: 'tensionEpisodeId' },
  ACTION: { privacy: 'actions', column: 'actionId' },
};

// Função pura, para testar as bordas sem banco.
export function readStatusOf(readAt: Date | undefined, updatedAt: Date): ReadStatus {
  if (!readAt) return 'NAO_LIDO';
  return readAt >= updatedAt ? 'LIDO' : 'ATUALIZADO';
}

// Mesma resposta do requireActiveLink: não diz se o registro existe nem de quem é.
function forbidden() {
  return new AppError(403, 'FORBIDDEN', 'Você não tem acesso aos registros deste paciente.');
}

function privacyRequired() {
  return new AppError(
    403,
    'PRIVACY_CONSENT_REQUIRED',
    'Para marcar estes registros, leia e aceite a versão atual do aviso de privacidade.',
  );
}

// Id e última mudança de cada registro da área, do paciente; `ids` restringe a busca.
async function recordsOf(type: ReadType, patientId: string, ids?: string[]) {
  const where = { userId: patientId, ...(ids && { id: { in: ids } }) };
  const select = { id: true, updatedAt: true } as const;
  if (type === 'THOUGHT_RECORD') return prisma.thoughtRecord.findMany({ where, select });
  if (type === 'TENSION_EPISODE') return prisma.tensionEpisode.findMany({ where, select });
  return prisma.behavioralAction.findMany({ where, select });
}

// Quando a terapeuta leu cada registro da área (só os que ela marcou).
async function readAtByRecord(therapistId: string, type: ReadType, ids: string[]): Promise<Map<string, Date>> {
  const column = AREA[type].column;
  const marks = await prisma.readMark.findMany({
    where: { therapistId, [column]: { in: ids } },
    select: { thoughtRecordId: true, tensionEpisodeId: true, actionId: true, readAt: true },
  });
  const pairs: [string, Date][] = [];
  for (const mark of marks) {
    const recordId = mark[column];
    if (recordId) pairs.push([recordId, mark.readAt]);
  }
  return new Map(pairs);
}

function coveredTypes(privacyVersion: string | null): ReadType[] {
  return READ_TYPES.filter((type) => coversArea(privacyVersion, AREA[type].privacy));
}

function groupByType(items: ReadMarkItem[]) {
  const groups = new Map<ReadType, string[]>();
  for (const { type, id } of items) groups.set(type, [...(groups.get(type) ?? []), id]);
  return groups;
}

// Os não lidos de cada paciente nas áreas que a terapeuta pode ver, para a lista de pacientes.
// Poucos registros por paciente: lê os ids e datas e conta na memória.
export async function countUnread(therapistId: string, patientIds: string[], privacyVersion: string | null) {
  const counts = new Map(patientIds.map((id) => [id, 0]));
  if (patientIds.length === 0) return counts;
  for (const type of coveredTypes(privacyVersion)) {
    const where = { userId: { in: patientIds } };
    const select = { id: true, userId: true, updatedAt: true } as const;
    const records =
      type === 'THOUGHT_RECORD'
        ? await prisma.thoughtRecord.findMany({ where, select })
        : type === 'TENSION_EPISODE'
          ? await prisma.tensionEpisode.findMany({ where, select })
          : await prisma.behavioralAction.findMany({ where, select });
    const readAt = await readAtByRecord(
      therapistId,
      type,
      records.map((record) => record.id),
    );
    for (const record of records) {
      if (readStatusOf(readAt.get(record.id), record.updatedAt) !== 'LIDO') {
        counts.set(record.userId, (counts.get(record.userId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function createReadMarksService(
  thoughtRecords: ThoughtRecordsService,
  tensionEpisodes: TensionEpisodesService,
  actions: ActionsService,
) {
  // Acrescenta o status de leitura a registros já no formato público (updatedAt em ISO).
  async function withReadStatus<T extends { id: string; updatedAt: string }>(
    therapistId: string,
    type: ReadType,
    records: T[],
  ): Promise<(T & ReadInfo)[]> {
    if (records.length === 0) return [];
    const readAt = await readAtByRecord(
      therapistId,
      type,
      records.map((record) => record.id),
    );
    return records.map((record) => {
      const at = readAt.get(record.id);
      return {
        ...record,
        readStatus: readStatusOf(at, new Date(record.updatedAt)),
        readAt: at?.toISOString() ?? null,
      };
    });
  }

  // Marca como lido agora. Toda a lista é conferida antes de gravar: um registro de outro
  // paciente, ou de área sem o aceite do aviso, recusa o pedido inteiro.
  async function mark(therapistId: string, patientId: string, privacyVersion: string | null, items: ReadMarkItem[]) {
    const groups = groupByType(items);
    for (const [type, ids] of groups) {
      if (!coversArea(privacyVersion, AREA[type].privacy)) throw privacyRequired();
      const owned = await recordsOf(type, patientId, ids);
      if (owned.length !== ids.length) throw forbidden();
    }

    const readAt = new Date();
    const upsertAll = () =>
      prisma.$transaction(
        items.map(({ type, id }) => {
        const column = AREA[type].column;
        return prisma.readMark.upsert({
          where:
            column === 'thoughtRecordId'
              ? { therapistId_thoughtRecordId: { therapistId, thoughtRecordId: id } }
              : column === 'tensionEpisodeId'
                ? { therapistId_tensionEpisodeId: { therapistId, tensionEpisodeId: id } }
                : { therapistId_actionId: { therapistId, actionId: id } },
          create: { therapistId, patientId, [column]: id, readAt },
          update: { readAt },
        });
        }),
      );
    try {
      await upsertAll();
    } catch (err) {
      // Dois pedidos ao mesmo tempo criando a mesma marca: o segundo perde a corrida no unique.
      // Na nova tentativa a marca já existe e o upsert só atualiza a data.
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      await upsertAll();
    }
    return { marked: items.length, readAt: readAt.toISOString() };
  }

  // "Marcar como não lido": apaga as marcas desta terapeuta nesses registros do paciente.
  async function unmark(therapistId: string, patientId: string, privacyVersion: string | null, items: ReadMarkItem[]) {
    let unmarked = 0;
    for (const [type, ids] of groupByType(items)) {
      if (!coversArea(privacyVersion, AREA[type].privacy)) throw privacyRequired();
      const { count } = await prisma.readMark.deleteMany({
        where: { therapistId, patientId, [AREA[type].column]: { in: ids } },
      });
      unmarked += count;
    }
    return { unmarked };
  }

  // A visão "Não lidos": tudo o que ainda não foi lido ou mudou depois de lido, de qualquer data,
  // nas áreas que a terapeuta pode ver. Área sem o aceite do aviso vem como null.
  async function unread(therapistId: string, patientId: string, privacyVersion: string | null) {
    const covered = new Set(coveredTypes(privacyVersion));

    async function pendingIds(type: ReadType) {
      const records = await recordsOf(type, patientId);
      const readAt = await readAtByRecord(
        therapistId,
        type,
        records.map((record) => record.id),
      );
      return records
        .filter((record) => readStatusOf(readAt.get(record.id), record.updatedAt) !== 'LIDO')
        .map((record) => record.id);
    }

    const thought = covered.has('THOUGHT_RECORD')
      ? await withReadStatus(
          therapistId,
          'THOUGHT_RECORD',
          await thoughtRecords.listByIds(patientId, await pendingIds('THOUGHT_RECORD')),
        )
      : null;
    const tension = covered.has('TENSION_EPISODE')
      ? await withReadStatus(
          therapistId,
          'TENSION_EPISODE',
          await tensionEpisodes.listByIds(patientId, await pendingIds('TENSION_EPISODE')),
        )
      : null;
    const action = covered.has('ACTION')
      ? await withReadStatus(therapistId, 'ACTION', await actions.listByIds(patientId, await pendingIds('ACTION')))
      : null;

    return {
      thoughtRecords: thought,
      tensionEpisodes: tension,
      actions: action,
      counts: {
        thoughtRecords: thought?.length ?? null,
        tensionEpisodes: tension?.length ?? null,
        actions: action?.length ?? null,
      },
    };
  }

  return { withReadStatus, mark, unmark, unread };
}

export type ReadMarksService = ReturnType<typeof createReadMarksService>;
