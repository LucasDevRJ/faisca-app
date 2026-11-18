import type { CheckIn, MedicationTaken } from './daily-check-ins-api';

// Textos do Sono e humor (DEC-108), aprovados pelo usuário. Sem cobrança, sem sequência e sem
// "você não registrou": esquecer um dia é normal (frontend/CLAUDE.md).

export const MOOD_WORD_MAX = 40;
// Os últimos 7 dias aceitam registro (DEC-107).
export const CHECK_IN_WINDOW_DAYS = 7;

export const SCORE_TEXT = {
  sleepQuality: { label: 'Como foi o sono?', short: 'sono', min: 'Muito ruim', max: 'Muito bom' },
  mood: { label: 'Como está seu humor hoje?', short: 'humor', min: 'Muito para baixo', max: 'Muito bem' },
} as const;

// Na pergunta do paciente.
export const MEDICATION_OPTIONS: { value: MedicationTaken; label: string }[] = [
  { value: 'TOMOU', label: 'Sim' },
  { value: 'ESQUECEU_ALGUM', label: 'Esqueci algum' },
  { value: 'NAO_TOMOU', label: 'Hoje não' },
];

// Numa linha curta, para o próprio paciente ("remédio: como combinado").
export const MEDICATION_SHORT: Record<MedicationTaken, string> = {
  TOMOU: 'como combinado',
  ESQUECEU_ALGUM: 'esqueci algum',
  NAO_TOMOU: 'hoje não',
};

// Na visão da profissional, em terceira pessoa.
export const MEDICATION_PROFESSIONAL: Record<MedicationTaken, string> = {
  TOMOU: 'tomou como combinado',
  ESQUECEU_ALGUM: 'esqueceu algum',
  NAO_TOMOU: 'não tomou',
};

// 450 → "7h30"; 480 → "8h".
export function formatSleep(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

// Horas de sono entre deitar e acordar; passar da meia-noite soma um dia (igual à API).
export function sleepMinutesBetween(bedTime: string, wakeTime: string): number | null {
  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  if (bedTime === wakeTime) return null;
  const diff = toMinutes(wakeTime) - toMinutes(bedTime);
  return diff > 0 ? diff : diff + 24 * 60;
}

// "Dormiu 7h30 · sono 6 · humor 7 · remédio: como combinado", só com o que foi respondido.
export function checkInSummary(checkIn: CheckIn, audience: 'patient' | 'therapist' = 'patient'): string {
  const parts: string[] = [];
  if (checkIn.sleepMinutes !== null) parts.push(`Dormiu ${formatSleep(checkIn.sleepMinutes)}`);
  if (checkIn.sleepQuality !== null) parts.push(`sono ${checkIn.sleepQuality}`);
  if (checkIn.mood !== null) parts.push(`humor ${checkIn.mood}`);
  if (checkIn.medication !== null) {
    parts.push(
      audience === 'patient'
        ? `remédio: ${MEDICATION_SHORT[checkIn.medication]}`
        : `remédio: ${MEDICATION_PROFESSIONAL[checkIn.medication]}`,
    );
  }
  const text = parts.join(' · ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
