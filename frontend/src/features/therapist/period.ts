import { addDays, daysBetween } from '../activities/week';
import { THERAPIST_MAX_DAYS, type Highlight } from './therapist-api';

export type DateRange = { from: string; to: string };

// Filtro "desde a última consulta" (SPEC, DEC-033): do dia da última consulta até hoje.
// Se passar do teto da API, fica com os dias mais recentes e avisa (truncated).
export function sinceLastAppointment(lastAppointment: string, today: string): DateRange & { truncated: boolean } {
  const oldest = addDays(today, -(THERAPIST_MAX_DAYS - 1));
  if (lastAppointment < oldest) return { from: oldest, to: today, truncated: true };
  return { from: lastAppointment, to: today, truncated: false };
}

// Todos os dias do período, em ordem.
export function daysInRange({ from, to }: DateRange): string[] {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
}

export function isInRange(day: string, { from, to }: DateRange): boolean {
  return day >= from && day <= to;
}

export const HIGHLIGHT_REASON: Record<Highlight['reason'], string> = {
  NEXT_APPOINTMENT: 'a semana antes da próxima consulta',
  LAST_7_DAYS: 'os últimos 7 dias, porque não há próxima consulta cadastrada',
};
