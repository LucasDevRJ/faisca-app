import { prisma } from '../../lib/prisma.js';
import type { PrivacyArea } from '../auth/privacy.js';
import type { SharedArea } from '../../generated/prisma/client.js';
import type { LinkedRecordType } from './record-links.schema.js';

// Regras de acesso e resumo dos registros ligáveis, usadas pelas ligações (DEC-111) e pelas
// mensagens "Sobre um registro" (DEC-128).
// Tipos e campos que podem aparecer no seletor. O dono é sempre confirmado na tabela de origem;
// IDs de outro paciente nunca são aceitos só porque foram enviados pelo cliente.
export const MODEL = {
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
export const ACCESS: Record<LinkedRecordType, { shared: SharedArea; privacy?: PrivacyArea }> = {
  ACTIVITY: { shared: 'ACTIVITIES' }, THOUGHT_RECORD: { shared: 'THOUGHT_RECORDS', privacy: 'thoughtRecords' },
  TENSION_EPISODE: { shared: 'TENSION_EPISODES', privacy: 'tensionEpisodes' }, ACTION: { shared: 'ACTIONS', privacy: 'actions' },
  PLAN: { shared: 'PLANS', privacy: 'plans' }, PLAN_ENTRY: { shared: 'PLANS', privacy: 'plans' },
  TASK: { shared: 'TASKS', privacy: 'tasks' }, SLEEP_MOOD: { shared: 'SLEEP_MOOD', privacy: 'sleepMood' },
  MEDICATION: { shared: 'MEDICATION', privacy: 'medication' },
};

export type RecordSummary = { type: LinkedRecordType; id: string; date: string; title: string; measure?: string; observation?: string; parentId?: string };
type Delegate = { findFirst(args: object): Promise<Record<string, unknown> | null>; findMany(args: object): Promise<Record<string, unknown>[]> };
export function delegate(type: LinkedRecordType): Delegate {
  return (prisma as unknown as Record<string, Delegate>)[MODEL[type][0]]!;
}
export function summary(type: LinkedRecordType, row: Record<string, unknown>): RecordSummary {
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

