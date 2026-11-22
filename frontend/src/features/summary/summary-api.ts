import { api } from '../../lib/api';
import type { DateRange } from '../appointments/appointments-api';
import type { Emotion } from '../thought-records/thought-records-api';

// Resumo do período em números (DEC-100). Cada área vem com o período atual e o anterior, do mesmo
// tamanho; área sem acesso (fechada pelo paciente ou sem o aceite) vem como null.

type Comparison<T> = { current: T; previous: T };

export type ActivitiesStats = {
  done: number;
  notDone: number;
  open: number;
  avgWantBefore: number | null;
  avgPleasure: number | null;
  avgAchievement: number | null;
};

export type ThoughtRecordsStats = {
  count: number;
  topEmotions: { emotion: Emotion; count: number; avgIntensity: number }[];
  avgBelief: number | null;
  withAlternative: number;
  alternativeEffect: { before: number | null; after: number | null } | null;
};

export type TensionEpisodesStats = {
  count: number;
  avgTension: number | null;
  maxTension: number | null;
  avgVocalize: number | null;
};

export type ActionsStats = {
  evaluated: number;
  notDone: number;
  planned: number;
  byCategory: { PRAZER: number; CONEXAO: number; REALIZACAO: number };
  avgExpectation: number | null;
  avgPleasure: number | null;
  avgAchievement: number | null;
};

export type PlansStats = { entries: number; plans: number };

// Sono e humor (DEC-107): a série vai para o gráfico, sem a palavra do dia.
export type SleepMoodStats = {
  nights: number;
  avgSleepMinutes: number | null;
  avgSleepQuality: number | null;
  moodDays: number;
  avgMood: number | null;
  minMood: number | null;
  maxMood: number | null;
  series: { date: string; sleepMinutes: number | null; sleepQuality: number | null; mood: number | null }[];
};

export type MedicationStats = { days: number; taken: number; forgotSome: number; notTaken: number };

// Remédios e o que sinto (DEC-114): só números e datas, sem o nome do remédio nem o texto do sintoma.
export type MedicationsStats = {
  activeMedications: number;
  changes: { date: string; kind: 'COMECOU' | 'MUDOU_DOSE' | 'PAROU' }[];
  newSymptoms: number;
  endedSymptoms: number;
  maxIntensity: number | null;
};

export type PeriodSummary = {
  period: DateRange;
  previousPeriod: DateRange;
  daysWithRecords: Comparison<number>;
  activities: Comparison<ActivitiesStats> | null;
  thoughtRecords: Comparison<ThoughtRecordsStats> | null;
  tensionEpisodes: Comparison<TensionEpisodesStats> | null;
  actions: Comparison<ActionsStats> | null;
  plans: Comparison<PlansStats> | null;
  sleepMood: Comparison<SleepMoodStats> | null;
  medication: Comparison<MedicationStats> | null;
  medications: Comparison<MedicationsStats> | null;
};

// "Meu resumo": a API usa a sessão, o front nunca manda o id.
export async function fetchMyPeriodSummary({ from, to }: DateRange): Promise<PeriodSummary> {
  const { data } = await api.get<PeriodSummary>('/period-summary', { params: { from, to } });
  return data;
}

export async function fetchPatientPeriodSummary(patientId: string, { from, to }: DateRange): Promise<PeriodSummary> {
  const { data } = await api.get<PeriodSummary>(`/therapist/patients/${patientId}/period-summary`, {
    params: { from, to },
  });
  return data;
}
