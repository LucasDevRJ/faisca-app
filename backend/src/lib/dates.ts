// Datas de calendário (DEC-007): o "dia" é sempre o de America/Sao_Paulo.
// Um DATE do Postgres chega ao Prisma como Date à meia-noite UTC, então a conversão
// entre 'AAAA-MM-DD' e Date é feita em UTC, sem passar pelo fuso da máquina.

export const APP_TIME_ZONE = 'America/Sao_Paulo';

const DAY_MS = 24 * 60 * 60 * 1000;

// en-CA formata como AAAA-MM-DD.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Dia de hoje em São Paulo, como 'AAAA-MM-DD'.
export function todayInAppZone(now: Date = new Date()): string {
  return dayFormatter.format(now);
}

export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Quantidade de dias entre duas datas 'AAAA-MM-DD' (to - from).
export function daysBetween(from: string, to: string): number {
  return Math.round((dateOnlyToDate(to).getTime() - dateOnlyToDate(from).getTime()) / DAY_MS);
}

// Soma (ou subtrai) dias de uma data 'AAAA-MM-DD'.
export function addDays(value: string, days: number): string {
  return dateToDateOnly(new Date(dateOnlyToDate(value).getTime() + days * DAY_MS));
}
