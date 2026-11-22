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

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

// Hora de agora no relógio de São Paulo, como 'HH:MM' (a mesma conta do backend).
export function nowTimeInAppZone(now: Date = new Date()): string {
  return timeFormatter.format(now);
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
const dayMonthYear = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
const dayOnly = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric' });
const weekdayLong = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' });
const dayMonthNumeric = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
});
const fullDateNumeric = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

// DEC-120: a data ganha o ano quando é de outro ano que não o atual (no fuso do app), para o passado
// e para o futuro. `{ year: false }` é só para os rótulos do eixo dos gráficos, que mostram uma
// semana e já têm o período no título.
export type YearOption = { year?: boolean; today?: string };

function showsYear(value: string, options: YearOption = {}): boolean {
  if (options.year === false) return false;
  return value.slice(0, 4) !== (options.today ?? todayInAppZone()).slice(0, 4);
}

function numeric(value: string, options?: YearOption): string {
  return (showsYear(value, options) ? fullDateNumeric : dayMonthNumeric).format(toUtcDate(value));
}

// "21 a 27 de set." ou, virando o mês, "29 de set. a 5 de out."; de outro ano, "21 a 27 de set. de 2025".
export function formatWeekRange(monday: string, options?: YearOption): string {
  const sunday = addDays(monday, 6);
  const start = toUtcDate(monday);
  const end = toUtcDate(sunday);
  const startYear = showsYear(monday, options);
  const endFormat = (showsYear(sunday, options) ? dayMonthYear : dayMonth).format(end);
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${dayOnly.format(start)} a ${endFormat}`;
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${(startYear && !sameYear ? dayMonthYear : dayMonth).format(start)} a ${endFormat}`;
}

// "segunda-feira, 21/09"; de outro ano, "segunda-feira, 21/09/2025".
export function formatDayHeading(value: string, options?: YearOption): string {
  return `${weekdayLong.format(toUtcDate(value))}, ${numeric(value, options)}`;
}

const weekdayShort = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'short' });

// "seg, 21/09": cabe ao lado de um nome sem ocupar uma linha inteira. De outro ano, "seg, 21/09/2025".
export function formatShortDay(value: string, options?: YearOption): string {
  return `${weekdayShort.format(toUtcDate(value)).replace('.', '')}, ${numeric(value, options)}`;
}

// "21/09"; de outro ano, "21/09/2025".
export function formatDayMonth(value: string, options?: YearOption): string {
  return numeric(value, options);
}

// "15/09/2026", sempre com o ano: para o histórico de remédios e do que a pessoa sente (#241).
export function formatFullDate(value: string): string {
  return fullDateNumeric.format(toUtcDate(value));
}

// Anos completos de `value` até `today` (0 se ainda não fez um ano ou se é no futuro).
export function yearsSince(value: string, today: string = todayInAppZone()): number {
  if (value >= today) return 0;
  const years = Number(today.slice(0, 4)) - Number(value.slice(0, 4));
  return today.slice(5) >= value.slice(5) ? years : years - 1;
}

// Quantos dias de `from` até `to` (negativo se `to` vem antes).
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / DAY_MS);
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

// "hoje", "amanhã", "em 7 dias", "ontem", "há 3 dias".
export function formatRelativeDay(value: string, today: string): string {
  return relative.format(daysBetween(today, value), 'day');
}
