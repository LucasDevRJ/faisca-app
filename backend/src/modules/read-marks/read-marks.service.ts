import { createTasksService, taskForProfessional } from '../tasks/tasks.service.js';
import { AppError } from '../../errors/app-error.js';
import { Prisma, type SharedArea } from '../../generated/prisma/client.js';
import { dateToDateOnly, todayInAppZone } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { AboutMeService, PublicAboutMe } from '../about-me/about-me.service.js';
import type { ActionsService } from '../actions/actions.service.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import { actionForProfessional, thoughtForProfessional } from '../../lib/shared-areas.js';
import type { PlansService } from '../plans/plans.service.js';
import type { TensionEpisodesService } from '../tension-episodes/tension-episodes.service.js';
import type { ThoughtRecordsService } from '../thought-records/thought-records.service.js';
import {
  encodeUnreadCursor,
  READ_TYPES,
  UNREAD_PAGE_SIZE,
  type ReadMarkItem,
  type ReadType,
  type UnreadCursor,
  type UnreadQuery,
} from './read-marks.schema.js';

// Marcas de leitura da terapeuta (SPEC, "Visão da terapeuta"; DEC-057). É a única escrita da
// terapeuta sobre os registros de um paciente (exceção da regra 1 do AGENTS.md), e nunca altera o
// registro: só a tabela ReadMark. O paciente não vê nada disso.

// NAO_LIDO: sem marca. LIDO: marcado depois da última mudança. ATUALIZADO: lido, mas o registro
// mudou depois (edição no dia, explicação alternativa, ação avaliada) e voltou a contar.
export type ReadStatus = 'NAO_LIDO' | 'LIDO' | 'ATUALIZADO';
export type ReadInfo = { readStatus: ReadStatus; readAt: string | null };

type Column = 'thoughtRecordId' | 'tensionEpisodeId' | 'actionId' | 'aboutId' | 'planEntryId' | 'taskId';

// Para cada tipo: a área do aviso de privacidade (DEC-042), a coluna da marca e a área que o
// paciente libera para a profissional (DEC-097).
const AREA: Record<ReadType, { privacy: PrivacyArea; column: Column; shared: SharedArea }> = {
  THOUGHT_RECORD: { privacy: 'thoughtRecords', column: 'thoughtRecordId', shared: 'THOUGHT_RECORDS' },
  TENSION_EPISODE: { privacy: 'tensionEpisodes', column: 'tensionEpisodeId', shared: 'TENSION_EPISODES' },
  ACTION: { privacy: 'actions', column: 'actionId', shared: 'ACTIONS' },
  ABOUT_ME: { privacy: 'aboutMe', column: 'aboutId', shared: 'ABOUT_ME' },
  PLAN_ENTRY: { privacy: 'plans', column: 'planEntryId', shared: 'PLANS' },
  TASK: { privacy: 'tasks', column: 'taskId', shared: 'TASKS' },
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
  if (type === 'ABOUT_ME') return prisma.patientAbout.findMany({ where, select });
  if (type === 'TASK') return prisma.homeworkTask.findMany({ where: { ...where, respondedAt: { not: null } }, select });
  if (type === 'PLAN_ENTRY') return prisma.planEntry.findMany({ where, select });
  return prisma.behavioralAction.findMany({ where, select });
}

type PendingDescriptor = UnreadCursor & { updatedAt: Date };

// Ordem do "Para ler" (DEC-058, DEC-123): do dia mais antigo ao mais novo; no mesmo dia, pelo
// instante do registro (ou da mudança, em Sobre mim e Tarefa), desempatando por tipo e id.
export function compareUnreadCursor(a: UnreadCursor, b: UnreadCursor): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.sortAt !== b.sortAt) return a.sortAt.localeCompare(b.sortAt);
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.id.localeCompare(b.id);
}

// Só os metadados leves para contar e ordenar antes de carregar o texto completo da página.
async function descriptorsOf(type: ReadType, patientId: string): Promise<PendingDescriptor[]> {
  const where = { userId: patientId };
  if (type === 'THOUGHT_RECORD') {
    const rows = await prisma.thoughtRecord.findMany({
      where,
      select: { id: true, updatedAt: true, createdAt: true, situationDate: true },
    });
    return rows.map((r) => ({
      type,
      id: r.id,
      updatedAt: r.updatedAt,
      date: dateToDateOnly(r.situationDate),
      sortAt: r.createdAt.toISOString(),
    }));
  }
  if (type === 'TENSION_EPISODE') {
    const rows = await prisma.tensionEpisode.findMany({
      where,
      select: { id: true, updatedAt: true, createdAt: true, episodeDate: true },
    });
    return rows.map((r) => ({
      type,
      id: r.id,
      updatedAt: r.updatedAt,
      date: dateToDateOnly(r.episodeDate),
      sortAt: r.createdAt.toISOString(),
    }));
  }
  if (type === 'ACTION') {
    const rows = await prisma.behavioralAction.findMany({
      where,
      select: { id: true, updatedAt: true, createdAt: true, actionDate: true },
    });
    return rows.map((r) => ({
      type,
      id: r.id,
      updatedAt: r.updatedAt,
      date: dateToDateOnly(r.actionDate),
      sortAt: r.createdAt.toISOString(),
    }));
  }
  if (type === 'PLAN_ENTRY') {
    const rows = await prisma.planEntry.findMany({
      where,
      select: { id: true, updatedAt: true, createdAt: true, entryDate: true },
    });
    return rows.map((r) => ({
      type,
      id: r.id,
      updatedAt: r.updatedAt,
      date: dateToDateOnly(r.entryDate),
      sortAt: r.createdAt.toISOString(),
    }));
  }
  if (type === 'ABOUT_ME') {
    const rows = await prisma.patientAbout.findMany({
      where,
      select: { id: true, updatedAt: true },
    });
    return rows.map((r) => ({
      type,
      id: r.id,
      updatedAt: r.updatedAt,
      date: todayInAppZone(r.updatedAt),
      sortAt: r.updatedAt.toISOString(),
    }));
  }
  const rows = await prisma.homeworkTask.findMany({
    where: { ...where, respondedAt: { not: null } },
    select: { id: true, updatedAt: true, respondedAt: true },
  });
  return rows.map((r) => ({
    type,
    id: r.id,
    updatedAt: r.updatedAt,
    date: todayInAppZone(r.respondedAt ?? r.updatedAt),
    sortAt: r.updatedAt.toISOString(),
  }));
}

// Quando a terapeuta leu cada registro da área (só os que ela marcou).
async function readAtByRecord(therapistId: string, type: ReadType, ids: string[]): Promise<Map<string, Date>> {
  const column = AREA[type].column;
  const marks = await prisma.readMark.findMany({
    where: { therapistId, [column]: { in: ids } },
    select: {
      thoughtRecordId: true,
      tensionEpisodeId: true,
      actionId: true,
      aboutId: true,
      planEntryId: true,
      taskId: true,
      readAt: true,
    },
  });
  const pairs: [string, Date][] = [];
  for (const mark of marks) {
    const recordId = mark[column];
    if (recordId) pairs.push([recordId, mark.readAt]);
  }
  return new Map(pairs);
}

// As áreas que a profissional pode ler: aceitou o aviso que as cita e o paciente as liberou.
function coveredTypes(privacyVersion: string | null, sharedAreas: SharedArea[]): ReadType[] {
  return READ_TYPES.filter(
    (type) => coversArea(privacyVersion, AREA[type].privacy) && sharedAreas.includes(AREA[type].shared),
  );
}

function groupByType(items: ReadMarkItem[]) {
  const groups = new Map<ReadType, string[]>();
  for (const { type, id } of items) groups.set(type, [...(groups.get(type) ?? []), id]);
  return groups;
}

// Os não lidos de cada paciente nas áreas que a terapeuta pode ver, para a lista de pacientes.
// Cada paciente traz as áreas que liberou para ela (DEC-097). Poucos registros por paciente: lê os
// ids e datas e conta na memória.
export async function countUnread(
  therapistId: string,
  patients: { id: string; sharedAreas: SharedArea[] }[],
  privacyVersion: string | null,
) {
  const counts = new Map(patients.map(({ id }) => [id, 0]));
  if (patients.length === 0) return counts;
  for (const type of READ_TYPES) {
    if (!coversArea(privacyVersion, AREA[type].privacy)) continue;
    const patientIds = patients.filter(({ sharedAreas }) => sharedAreas.includes(AREA[type].shared)).map(({ id }) => id);
    if (patientIds.length === 0) continue;
    const where = { userId: { in: patientIds } };
    const select = { id: true, userId: true, updatedAt: true } as const;
    const records =
      type === 'THOUGHT_RECORD'
        ? await prisma.thoughtRecord.findMany({ where, select })
        : type === 'TENSION_EPISODE'
          ? await prisma.tensionEpisode.findMany({ where, select })
          : type === 'ABOUT_ME'
            ? await prisma.patientAbout.findMany({ where, select })
            : type === 'PLAN_ENTRY'
              ? await prisma.planEntry.findMany({ where, select })
              : type === 'TASK'
                ? await prisma.homeworkTask.findMany({ where: { ...where, respondedAt: { not: null } }, select })
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
  aboutMe: AboutMeService,
  plans: PlansService,
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
  // paciente, de área sem o aceite do aviso ou de área que o paciente não liberou para esta
  // profissional (DEC-097) recusa o pedido inteiro.
  async function mark(
    therapistId: string,
    patientId: string,
    privacyVersion: string | null,
    sharedAreas: SharedArea[],
    items: ReadMarkItem[],
  ) {
    const groups = groupByType(items);
    for (const [type, ids] of groups) {
      if (!sharedAreas.includes(AREA[type].shared)) throw forbidden();
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
                : column === 'aboutId'
                  ? { therapistId_aboutId: { therapistId, aboutId: id } }
                  : column === 'planEntryId'
                    ? { therapistId_planEntryId: { therapistId, planEntryId: id } }
                    : column === 'taskId'
                      ? { therapistId_taskId: { therapistId, taskId: id } }
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
  async function unmark(
    therapistId: string,
    patientId: string,
    privacyVersion: string | null,
    sharedAreas: SharedArea[],
    items: ReadMarkItem[],
  ) {
    let unmarked = 0;
    for (const [type, ids] of groupByType(items)) {
      if (!sharedAreas.includes(AREA[type].shared)) throw forbidden();
      if (!coversArea(privacyVersion, AREA[type].privacy)) throw privacyRequired();
      const { count } = await prisma.readMark.deleteMany({
        where: { therapistId, patientId, [AREA[type].column]: { in: ids } },
      });
      unmarked += count;
    }
    return { unmarked };
  }

  // A visão "Não lidos": tudo o que ainda não foi lido ou mudou depois de lido, de qualquer data,
  // nas áreas que a terapeuta pode ver. Área sem o aceite do aviso, ou que o paciente não liberou
  // para ela (DEC-097), vem como null. Paginada com cursor de até UNREAD_PAGE_SIZE registros por vez,
  // do mais antigo ao mais novo, mantendo o total geral de cada área em counts (DEC-123).
  async function unread(
    therapistId: string,
    patientId: string,
    privacyVersion: string | null,
    sharedAreas: SharedArea[],
    query: UnreadQuery = {},
  ) {
    const covered = new Set(coveredTypes(privacyVersion, sharedAreas));
    const pendingByType = new Map<ReadType, PendingDescriptor[]>();

    for (const type of READ_TYPES) {
      if (!covered.has(type)) continue;
      const descriptors = await descriptorsOf(type, patientId);
      const readAt = await readAtByRecord(
        therapistId,
        type,
        descriptors.map((record) => record.id),
      );
      pendingByType.set(
        type,
        descriptors.filter((record) => readStatusOf(readAt.get(record.id), record.updatedAt) !== 'LIDO'),
      );
    }

    const allPending = [...pendingByType.values()].flat().sort(compareUnreadCursor);
    const afterCursor = query.cursor
      ? allPending.filter((item) => compareUnreadCursor(item, query.cursor!) > 0)
      : allPending;
    const page = afterCursor.slice(0, UNREAD_PAGE_SIZE);
    const last = page[page.length - 1];
    const nextCursor =
      afterCursor.length > UNREAD_PAGE_SIZE && last
        ? encodeUnreadCursor({ date: last.date, sortAt: last.sortAt, type: last.type, id: last.id })
        : null;

    function pageIds(type: ReadType): string[] {
      return page.filter((item) => item.type === type).map((item) => item.id);
    }

    const thought = covered.has('THOUGHT_RECORD')
      ? await withReadStatus(
          therapistId,
          'THOUGHT_RECORD',
          (await thoughtRecords.listByIds(patientId, pageIds('THOUGHT_RECORD'))).map((record) =>
            thoughtForProfessional(record, sharedAreas),
          ),
        )
      : null;
    const tension = covered.has('TENSION_EPISODE')
      ? await withReadStatus(
          therapistId,
          'TENSION_EPISODE',
          await tensionEpisodes.listByIds(patientId, pageIds('TENSION_EPISODE')),
        )
      : null;
    const action = covered.has('ACTION')
      ? await withReadStatus(
          therapistId,
          'ACTION',
          (await actions.listByIds(patientId, pageIds('ACTION'))).map((action) =>
            actionForProfessional(action, sharedAreas),
          ),
        )
      : null;
    const planEntries = covered.has('PLAN_ENTRY')
      ? await withReadStatus(
          therapistId,
          'PLAN_ENTRY',
          await plans.listEntriesByIds(patientId, pageIds('PLAN_ENTRY')),
        )
      : null;
    // O "Sobre mim" é um só: entra se ainda não foi lido ou mudou depois de lido e caiu nesta página.
    let about: (PublicAboutMe & ReadInfo)[] | null = null;
    if (covered.has('ABOUT_ME') && pageIds('ABOUT_ME').length > 0) {
      const current = await aboutMe.get(patientId);
      about = current ? await withReadStatus(therapistId, 'ABOUT_ME', [current]) : [];
    }

    const taskIds = pageIds('TASK');
    const tasks = covered.has('TASK')
      ? taskIds.length > 0
        ? await withReadStatus(
            therapistId,
            'TASK',
            (await createTasksService().list(patientId, taskIds)).map((task) => taskForProfessional(task, sharedAreas)),
          )
        : []
      : null;
    return {
      tasks,
      thoughtRecords: thought,
      tensionEpisodes: tension,
      actions: action,
      // null sem o aceite do aviso que cita o "Sobre mim"; [] quando já foi lido ou ficou noutra página.
      aboutMe: covered.has('ABOUT_ME') ? (about ?? []) : null,
      // Meus Planos (DEC-094): null sem o aceite da versão que o cita.
      planEntries,
      counts: {
        tasks: covered.has('TASK') ? (pendingByType.get('TASK')?.length ?? 0) : null,
        thoughtRecords: covered.has('THOUGHT_RECORD') ? (pendingByType.get('THOUGHT_RECORD')?.length ?? 0) : null,
        tensionEpisodes: covered.has('TENSION_EPISODE') ? (pendingByType.get('TENSION_EPISODE')?.length ?? 0) : null,
        actions: covered.has('ACTION') ? (pendingByType.get('ACTION')?.length ?? 0) : null,
        aboutMe: covered.has('ABOUT_ME') ? (pendingByType.get('ABOUT_ME')?.length ?? 0) : null,
        planEntries: covered.has('PLAN_ENTRY') ? (pendingByType.get('PLAN_ENTRY')?.length ?? 0) : null,
      },
      nextCursor,
    };
  }

  return { withReadStatus, mark, unmark, unread };
}

export type ReadMarksService = ReturnType<typeof createReadMarksService>;
