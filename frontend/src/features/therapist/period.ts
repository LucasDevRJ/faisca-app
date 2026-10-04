import { addDays, daysBetween } from '../activities/week';

export type DateRange = { from: string; to: string };

// Todos os dias do período, em ordem.
export function daysInRange({ from, to }: DateRange): string[] {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i));
}

export function isInRange(day: string, { from, to }: DateRange): boolean {
  return day >= from && day <= to;
}
