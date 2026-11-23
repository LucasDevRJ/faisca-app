import { AppError } from '../../errors/app-error.js';
import { prisma } from '../../lib/prisma.js';
import { ACCESS, delegate, MODEL, summary, type RecordSummary } from './record-access.js';
import { coversArea } from '../auth/privacy.js';
import { lockRecordLinksForPatient } from './record-links.cleanup.js';
import type { SharedArea } from '../../generated/prisma/client.js';
import type { CandidatesQuery, CreateLinkInput, LinkedRecordType, ListLinksQuery } from './record-links.schema.js';

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
    async candidates(userId: string, query: CandidatesQuery) {
      const version = await privacyVersion(userId);
      // Sem registro de origem (DEC-128), o schema já exige o período.
      let sourceDate: string | null = null;
      if (query.recordType && query.recordId) {
        requireAccess(version, query.recordType);
        sourceDate = (await owned(userId, query.recordType, query.recordId)).date;
      }
      const around = (days: number) => new Date(Date.parse(`${sourceDate}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
      const from = query.from ?? around(-14);
      const to = query.to ?? around(14);
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
