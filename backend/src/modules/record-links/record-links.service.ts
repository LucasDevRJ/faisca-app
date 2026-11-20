import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import { lockRecordLinksForPatient } from './record-links.cleanup.js';
import type { SharedArea } from '../../generated/prisma/client.js';
import type { CreateLinkInput, LinkedRecordType, ListLinksQuery } from './record-links.schema.js';

// Tipos e campos que podem aparecer no seletor. O dono é sempre confirmado na tabela de origem;
// IDs de outro paciente nunca são aceitos só porque foram enviados pelo cliente.
const MODEL = {
  ACTIVITY: ['activity', 'activityDate'],
  THOUGHT_RECORD: ['thoughtRecord', 'situationDate'],
  TENSION_EPISODE: ['tensionEpisode', 'episodeDate'],
  ACTION: ['behavioralAction', 'actionDate'],
  PLAN: ['plan', 'createdAt'],
  PLAN_ENTRY: ['planEntry', 'entryDate'],
  TASK: ['homeworkTask', 'createdAt'],
  SLEEP_MOOD: ['dailyCheckIn', 'checkInDate'],
  MEDICATION: ['dailyCheckIn', 'checkInDate'],
} as const;
const ACCESS: Record<LinkedRecordType, { shared: SharedArea; privacy?: PrivacyArea }> = {
  ACTIVITY: { shared: 'ACTIVITIES' }, THOUGHT_RECORD: { shared: 'THOUGHT_RECORDS', privacy: 'thoughtRecords' },
  TENSION_EPISODE: { shared: 'TENSION_EPISODES', privacy: 'tensionEpisodes' }, ACTION: { shared: 'ACTIONS', privacy: 'actions' },
  PLAN: { shared: 'PLANS', privacy: 'plans' }, PLAN_ENTRY: { shared: 'PLANS', privacy: 'plans' },
  TASK: { shared: 'TASKS', privacy: 'tasks' }, SLEEP_MOOD: { shared: 'SLEEP_MOOD', privacy: 'sleepMood' },
  MEDICATION: { shared: 'MEDICATION', privacy: 'medication' },
};

type RecordSummary = { type: LinkedRecordType; id: string; date: string; title: string; measure?: string; observation?: string; parentId?: string };
type Delegate = { findFirst(args: object): Promise<Record<string, unknown> | null>; findMany(args: object): Promise<Record<string, unknown>[]> };
function delegate(type: LinkedRecordType): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[MODEL[type][0]]!;
}
function summary(type: LinkedRecordType, row: Record<string, unknown>): RecordSummary {
  const id = String(row.id);
  const rawDate = row[MODEL[type][1]];
  const date = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate ?? '');
  const title = type === 'THOUGHT_RECORD' ? String(row.automaticThought ?? '')
    : type === 'TENSION_EPISODE' ? String(row.situation ?? '')
      : type === 'ACTION' ? String(row.name ?? '')
        : type === 'PLAN' ? String(row.title ?? '')
          : type === 'PLAN_ENTRY' ? 'Registro do plano'
            : type === 'TASK' ? String(row.title ?? '')
              : type === 'ACTIVITY' ? String(row.name ?? '') : type === 'MEDICATION' ? 'Remédio do dia' : 'Sono e humor';
  const measure = type === 'THOUGHT_RECORD'
    ? `Crença ${String(row.beliefLevel ?? '—')}/10${Array.isArray(row.emotions) ? ` · ${row.emotions.map((emotion) => `${String(emotion.emotion)} ${String(emotion.intensity)}/10`).join(', ')}` : ''}`
    : type === 'TENSION_EPISODE' ? `Tensão ${String(row.tensionLevel ?? '—')}/10` : undefined;
  const observation = type === 'ACTIVITY' && typeof row.observation === 'string' ? row.observation : undefined;
  const parentId = type === 'PLAN_ENTRY' && typeof row.planId === 'string' ? row.planId : undefined;
  return { type, id, date, title, ...(measure && { measure }), ...(observation && { observation }), ...(parentId && { parentId }) };
}

export function createRecordLinksService() {
  async function privacyVersion(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { privacyVersion: true } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Conta não encontrada.');
    return user.privacyVersion;
  }
  function canAccessType(version: string | null, type: LinkedRecordType) {
    const area = ACCESS[type].privacy;
    return !area || coversArea(version, area);
  }
  function requireAccess(version: string | null, ...types: LinkedRecordType[]) {
    if (types.some((type) => !canAccessType(version, type))) {
      throw new AppError(403, 'PRIVACY_CONSENT_REQUIRED', 'Leia e aceite o aviso de privacidade atualizado para usar essas áreas.');
    }
  }
  function publicLink(row: { id: string; sourceType: string; sourceId: string; targetType: string; targetId: string; kind: string; createdAt: Date }, source: RecordSummary, target: RecordSummary) {
    return { id: row.id, sourceType: row.sourceType, sourceId: row.sourceId, targetType: row.targetType, targetId: row.targetId, kind: row.kind, createdAt: row.createdAt, source, target };
  }
  async function owned(userId: string, type: LinkedRecordType, id: string) {
    const row = await delegate(type).findFirst({ where: { id, userId }, ...(type === 'THOUGHT_RECORD' && { include: { emotions: true } }) });
    if (!row) throw new AppError(404, 'RECORD_NOT_FOUND', 'Registro não encontrado.');
    return summary(type, row);
  }
  return {
    async list(userId: string, query: ListLinksQuery) {
      const version = await privacyVersion(userId);
      requireAccess(version, query.recordType);
      await owned(userId, query.recordType, query.recordId);
      let rows = await prisma.recordLink.findMany({
        where: { userId, OR: [
          { sourceType: query.recordType, sourceId: query.recordId },
          { targetType: query.recordType, targetId: query.recordId },
        ] }, orderBy: { createdAt: 'asc' },
      });
      const roots = rows.filter((row) => row.kind === 'REPETITION').map((row) =>
        row.sourceType === query.recordType ? row.sourceId : row.targetId,
      );
      if (roots.length) {
        const siblings = await prisma.recordLink.findMany({ where: {
          userId, kind: 'REPETITION', sourceType: query.recordType, sourceId: { in: [...new Set(roots)] },
        }, orderBy: { createdAt: 'asc' } });
        rows = [...new Map([...rows, ...siblings].map((row) => [row.id, row])).values()];
      }
      const visible = rows.filter((row) => canAccessType(version, row.sourceType as LinkedRecordType)
        && canAccessType(version, row.targetType as LinkedRecordType));
      return Promise.all(visible.map(async (row) => {
        const sourceType = row.sourceType as LinkedRecordType;
        const targetType = row.targetType as LinkedRecordType;
        const [source, target] = await Promise.all([
          owned(userId, sourceType, row.sourceId), owned(userId, targetType, row.targetId),
        ]);
        return publicLink(row, source, target);
      }));
    },
    async listForTherapist(patientId: string, therapistId: string, sharedAreas: SharedArea[], patientPrivacyVersion: string | null, query: ListLinksQuery) {
      const selectedAccess = ACCESS[query.recordType];
      if (!sharedAreas.includes(selectedAccess.shared) || (selectedAccess.privacy && !coversArea(patientPrivacyVersion, selectedAccess.privacy))) return [];
      const therapist = await prisma.user.findUnique({ where: { id: therapistId }, select: { privacyVersion: true } });
      if (!therapist || (selectedAccess.privacy && !coversArea(therapist.privacyVersion, selectedAccess.privacy))) return [];
      let rows = await prisma.recordLink.findMany({ where: { userId: patientId, OR: [
        { sourceType: query.recordType, sourceId: query.recordId }, { targetType: query.recordType, targetId: query.recordId },
      ] }, orderBy: { createdAt: 'asc' } });
      const roots = rows.filter((row) => row.kind === 'REPETITION').map((row) =>
        row.sourceType === query.recordType ? row.sourceId : row.targetId,
      );
      if (roots.length) {
        const siblings = await prisma.recordLink.findMany({ where: {
          userId: patientId, kind: 'REPETITION', sourceType: query.recordType, sourceId: { in: [...new Set(roots)] },
        }, orderBy: { createdAt: 'asc' } });
        rows = [...new Map([...rows, ...siblings].map((row) => [row.id, row])).values()];
      }
      const visible = rows.filter((row) => {
        const sourceAccess = ACCESS[row.sourceType as LinkedRecordType];
        const targetAccess = ACCESS[row.targetType as LinkedRecordType];
        return sharedAreas.includes(sourceAccess.shared) && sharedAreas.includes(targetAccess.shared)
          && (!sourceAccess.privacy || (coversArea(patientPrivacyVersion, sourceAccess.privacy) && coversArea(therapist.privacyVersion, sourceAccess.privacy)))
          && (!targetAccess.privacy || (coversArea(patientPrivacyVersion, targetAccess.privacy) && coversArea(therapist.privacyVersion, targetAccess.privacy)));
      });
      return Promise.all(visible.map(async (row) => {
        const sourceType = row.sourceType as LinkedRecordType;
        const targetType = row.targetType as LinkedRecordType;
        const [sourceRow, targetRow] = await Promise.all([
          delegate(sourceType).findFirst({ where: { userId: patientId, id: row.sourceId }, ...(sourceType === 'THOUGHT_RECORD' && { include: { emotions: true } }) }),
          delegate(targetType).findFirst({ where: { userId: patientId, id: row.targetId }, ...(targetType === 'THOUGHT_RECORD' && { include: { emotions: true } }) }),
        ]);
        if (!sourceRow || !targetRow) return null;
        const source = summary(sourceType, sourceRow);
        const target = summary(targetType, targetRow);
        return publicLink(row, source, target);
      })).then((links) => links.filter((link): link is NonNullable<typeof link> => link !== null));
    },
    async candidates(userId: string, query: ListLinksQuery) {
      const version = await privacyVersion(userId);
      requireAccess(version, query.recordType);
      const source = await owned(userId, query.recordType, query.recordId);
      const from = query.from ?? new Date(Date.parse(`${source.date}T00:00:00Z`) - 14 * 86400000).toISOString().slice(0, 10);
      const to = query.to ?? new Date(Date.parse(`${source.date}T00:00:00Z`) + 14 * 86400000).toISOString().slice(0, 10);
      const types = Object.keys(MODEL) as LinkedRecordType[];
      const groups = await Promise.all(types.filter((type) => canAccessType(version, type)).map(async (type) => {
        const [, dateField] = MODEL[type];
        const rows = await delegate(type).findMany({
          where: { userId, [dateField]: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) } },
          orderBy: { [dateField]: 'desc' }, take: 100,
        });
        return rows.filter((row) => !(type === query.recordType && row.id === query.recordId)).map((row) => summary(type, row));
      }));
      return groups.flat().sort((a, b) => b.date.localeCompare(a.date));
    },
    async create(userId: string, input: CreateLinkInput) {
      const version = await privacyVersion(userId);
      requireAccess(version, input.sourceType, input.targetType);
      if (input.kind === 'REPETITION' && (input.sourceType !== input.targetType || !['THOUGHT_RECORD', 'TENSION_EPISODE'].includes(input.sourceType))) {
        throw new AppError(400, 'INVALID_REPETITION', 'Repetições só podem ligar pensamentos ou episódios de tensão da mesma área.');
      }
      try {
        return await prisma.$transaction(async (tx) => {
          await lockRecordLinksForPatient(tx, userId);
          const normalized = input.kind === 'RELATED' && `${input.sourceType}:${input.sourceId}` > `${input.targetType}:${input.targetId}`
            ? { sourceType: input.targetType, sourceId: input.targetId, targetType: input.sourceType, targetId: input.sourceId }
            : { sourceType: input.sourceType, sourceId: input.sourceId, targetType: input.targetType, targetId: input.targetId };
          const [source, target] = await Promise.all([
            owned(userId, normalized.sourceType, normalized.sourceId), owned(userId, normalized.targetType, normalized.targetId),
          ]);
          const link = await tx.recordLink.create({ data: { userId, ...normalized, kind: input.kind } });
          return publicLink(link, source, target);
        });
      } catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 'P2002') {
          throw new AppError(409, 'RECORD_LINK_EXISTS', 'Esses registros já estão ligados.');
        }
        throw error;
      }
    },
    async remove(userId: string, id: string) {
      await prisma.$transaction(async (tx) => {
        await lockRecordLinksForPatient(tx, userId);
        const deleted = await tx.recordLink.deleteMany({ where: { id, userId } });
        if (!deleted.count) throw new AppError(404, 'RECORD_LINK_NOT_FOUND', 'Ligação não encontrada.');
      });
    },
  };
}
export type RecordLinksService = ReturnType<typeof createRecordLinksService>;
