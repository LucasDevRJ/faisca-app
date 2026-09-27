// Datas de calendário no front, com as mesmas regras do backend (DEC-007): o "dia" é o de
// America/Sao_Paulo e as datas trafegam como 'AAAA-MM-DD'. Contas em UTC, para o fuso do
// aparelho nunca mudar o dia.

const APP_TIME_ZONE = 'America/Sao_Paulo';
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const todayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function todayInAppZone(now: Date = new Date()): string {
  return todayFormatter.format(now);
}

function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addDays(value: string, days: number): string {
  return new Date(toUtcDate(value).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function isValidDateOnly(value: string | null | undefined): value is string {
  if (!value || !DATE_ONLY.test(value)) return false;
  // Recusa datas que o Date "corrige", como 2026-02-30.
  return !Number.isNaN(toUtcDate(value).getTime()) && addDays(value, 0) === value;
}

// Segunda-feira da semana da data (a semana vai de segunda a domingo, SPEC).
export function startOfWeek(value: string): string {
  const weekday = toUtcDate(value).getUTCDay(); // 0 = domingo
  return addDays(value, -((weekday + 6) % 7));
}

export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const dayMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' });
const dayOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' });
const dayMonthNumeric = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
});

// "21 a 27 de set." ou, virando o mês, "29 de set. a 5 de out."
export function formatWeekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const start = toUtcDate(monday);
  const end = toUtcDate(sunday);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${dayOnly.format(start)} a ${dayMonth.format(end)}`;
  }
  return `${dayMonth.format(start)} a ${dayMonth.format(end)}`;
}

// "segunda-feira, 21/09"
export function formatDayHeading(value: string): string {
  const date = toUtcDate(value);
  return `${weekdayLong.format(date)}, ${dayMonthNumeric.format(date)}`;
}
