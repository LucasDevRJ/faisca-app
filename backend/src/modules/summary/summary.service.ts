import type { Emotion, SharedArea } from '../../generated/prisma/client.js';
import { addDays, dateOnlyToDate, dateToDateOnly, daysBetween } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import { coversArea, type PrivacyArea } from '../auth/privacy.js';
import type { PeriodSummaryQuery } from './summary.schema.js';

// Resumo do período em números (DEC-100, #172): só contagens e médias calculadas na hora, a partir
// dos registros que já existem, sem interpretação e sem guardar nada novo. O período anterior tem o
// mesmo tamanho e termina na véspera do atual.

// As áreas do resumo e o aceite do aviso que cada uma pede (as Atividades não pedem nenhum).
export const SUMMARY_AREAS = ['ACTIVITIES', 'THOUGHT_RECORDS', 'TENSION_EPISODES', 'ACTIONS', 'PLANS'] as const;
export type SummaryArea = (typeof SUMMARY_AREAS)[number];

const PRIVACY_OF: Record<SummaryArea, PrivacyArea | null> = {
  ACTIVITIES: null,
  THOUGHT_RECORDS: 'thoughtRecords',
  TENSION_EPISODES: 'tensionEpisodes',
  ACTIONS: 'actions',
  PLANS: 'plans',
};

// O que quem pede pode ver: na profissional, a área liberada pelo paciente (DEC-097) e o aceite
// dela; no paciente, o aceite dele. Área sem acesso vem como null, e os dias com registro não a contam.
export function visibleSummaryAreas(
  privacyVersion: string | null,
  sharedAreas?: readonly SharedArea[],
): SummaryArea[] {
  return SUMMARY_AREAS.filter((area) => {
    if (sharedAreas && !sharedAreas.includes(area)) return false;
    const privacy = PRIVACY_OF[area];
    return privacy === null || coversArea(privacyVersion, privacy);
  });
}

type Range = { from: string; to: string };

// Média com uma casa decimal; sem valores, null.
function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function present(values: (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

function between({ from, to }: Range) {
  return { gte: dateOnlyToDate(from), lte: dateOnlyToDate(to) };
}

async function activitiesStats(userId: string, range: Range, days: Set<string>) {
  const rows = await prisma.activity.findMany({
    where: { userId, activityDate: between(range) },
    select: { activityDate: true, status: true, wantBefore: true, pleasure: true, achievement: true },
  });
  rows.forEach((row) => days.add(dateToDateOnly(row.activityDate)));
  const done = rows.filter((row) => row.status === 'CONCLUIDA');
  return {
    done: done.length,
    notDone: rows.filter((row) => row.status === 'NAO_REALIZADA').length,
    open: rows.filter((row) => row.status === 'PLANEJADA' || row.status === 'PENDENTE').length,
    // Nas feitas: a vontade antes, o prazer e a realização.
    avgWantBefore: average(present(done.map((row) => row.wantBefore))),
    avgPleasure: average(present(done.map((row) => row.pleasure))),
    avgAchievement: average(present(done.map((row) => row.achievement))),
  };
}

const TOP_EMOTIONS = 3;

async function thoughtRecordsStats(userId: string, range: Range, days: Set<string>) {
  const rows = await prisma.thoughtRecord.findMany({
    where: { userId, situationDate: between(range) },
    select: {
      situationDate: true,
      beliefLevel: true,
      alternativeExplanation: true,
      emotions: { select: { emotion: true, intensity: true, intensityAfter: true } },
    },
  });
  rows.forEach((row) => days.add(dateToDateOnly(row.situationDate)));

  // "Outra" conta como uma só, sem o nome escrito pelo paciente.
  const byEmotion = new Map<Emotion, number[]>();
  for (const { emotion, intensity } of rows.flatMap((row) => row.emotions)) {
    byEmotion.set(emotion, [...(byEmotion.get(emotion) ?? []), intensity]);
  }
  const topEmotions = [...byEmotion.entries()]
    .map(([emotion, intensities]) => ({ emotion, count: intensities.length, avgIntensity: average(intensities) ?? 0 }))
    .sort((a, b) => b.count - a.count || b.avgIntensity - a.avgIntensity || a.emotion.localeCompare(b.emotion))
    .slice(0, TOP_EMOTIONS);

  const withAlternative = rows.filter((row) => row.alternativeExplanation !== null);
  const reassessed = withAlternative.flatMap((row) => row.emotions).filter((e) => e.intensityAfter !== null);
  return {
    count: rows.length,
    topEmotions,
    avgBelief: average(rows.map((row) => row.beliefLevel)),
    withAlternative: withAlternative.length,
    // Nas emoções reavaliadas depois da explicação alternativa: a intensidade antes e depois.
    alternativeEffect:
      reassessed.length === 0
        ? null
        : {
            before: average(reassessed.map((e) => e.intensity)),
            after: average(present(reassessed.map((e) => e.intensityAfter))),
          },
  };
}

async function tensionEpisodesStats(userId: string, range: Range, days: Set<string>) {
  const rows = await prisma.tensionEpisode.findMany({
    where: { userId, episodeDate: between(range) },
    select: { episodeDate: true, tensionLevel: true, vocalizeUrge: true },
  });
  rows.forEach((row) => days.add(dateToDateOnly(row.episodeDate)));
  return {
    count: rows.length,
    avgTension: average(rows.map((row) => row.tensionLevel)),
    maxTension: rows.length === 0 ? null : Math.max(...rows.map((row) => row.tensionLevel)),
    avgVocalize: average(rows.map((row) => row.vocalizeUrge)),
  };
}

async function actionsStats(userId: string, range: Range, days: Set<string>) {
  const rows = await prisma.behavioralAction.findMany({
    where: { userId, actionDate: between(range) },
    select: { actionDate: true, category: true, status: true, expectation: true, pleasure: true, achievement: true },
  });
  rows.forEach((row) => days.add(dateToDateOnly(row.actionDate)));
  const evaluated = rows.filter((row) => row.status === 'AVALIADA');
  return {
    evaluated: evaluated.length,
    notDone: rows.filter((row) => row.status === 'NAO_REALIZADA').length,
    planned: rows.filter((row) => row.status === 'PLANEJADA').length,
    // Avaliadas por tipo.
    byCategory: {
      PRAZER: evaluated.filter((row) => row.category === 'PRAZER').length,
      CONEXAO: evaluated.filter((row) => row.category === 'CONEXAO').length,
      REALIZACAO: evaluated.filter((row) => row.category === 'REALIZACAO').length,
    },
    // Nas avaliadas: o que esperava e o que veio depois.
    avgExpectation: average(evaluated.map((row) => row.expectation)),
    avgPleasure: average(present(evaluated.map((row) => row.pleasure))),
    avgAchievement: average(present(evaluated.map((row) => row.achievement))),
  };
}

async function plansStats(userId: string, range: Range, days: Set<string>) {
  const rows = await prisma.planEntry.findMany({
    where: { userId, entryDate: between(range) },
    select: { entryDate: true, planId: true },
  });
  rows.forEach((row) => days.add(dateToDateOnly(row.entryDate)));
  return { entries: rows.length, plans: new Set(rows.map((row) => row.planId)).size };
}

type Comparison<T> = { current: T; previous: T };
type DaySets = { current: Set<string>; previous: Set<string> };

async function compare<T>(
  visible: boolean,
  stats: (userId: string, range: Range, days: Set<string>) => Promise<T>,
  userId: string,
  ranges: { current: Range; previous: Range },
  days: DaySets,
): Promise<Comparison<T> | null> {
  if (!visible) return null;
  const [current, previous] = await Promise.all([
    stats(userId, ranges.current, days.current),
    stats(userId, ranges.previous, days.previous),
  ]);
  return { current, previous };
}

// O período anterior: o mesmo número de dias, terminando na véspera do atual.
export function previousRange({ from, to }: Range): Range {
  const length = daysBetween(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

export function createSummaryService() {
  async function periodSummary(userId: string, query: PeriodSummaryQuery, areas: SummaryArea[]) {
    const ranges = { current: { from: query.from, to: query.to }, previous: previousRange(query) };
    const days: DaySets = { current: new Set(), previous: new Set() };
    const sees = (area: SummaryArea) => areas.includes(area);
    const [activities, thoughtRecords, tensionEpisodes, actions, plans] = await Promise.all([
      compare(sees('ACTIVITIES'), activitiesStats, userId, ranges, days),
      compare(sees('THOUGHT_RECORDS'), thoughtRecordsStats, userId, ranges, days),
      compare(sees('TENSION_EPISODES'), tensionEpisodesStats, userId, ranges, days),
      compare(sees('ACTIONS'), actionsStats, userId, ranges, days),
      compare(sees('PLANS'), plansStats, userId, ranges, days),
    ]);
    return {
      period: ranges.current,
      previousPeriod: ranges.previous,
      // Só das áreas visíveis: uma área fechada não aparece nem como dia com registro.
      daysWithRecords: { current: days.current.size, previous: days.previous.size },
      activities,
      thoughtRecords,
      tensionEpisodes,
      actions,
      plans,
    };
  }

  return { periodSummary };
}

export type SummaryService = ReturnType<typeof createSummaryService>;
