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

const wallClockFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

// Instante (UTC) em que começa o dia 'AAAA-MM-DD' em São Paulo. Calcula o deslocamento do fuso
// naquele dia, em vez de fixar -03:00, para não depender de não haver horário de verão.
export function startOfDayInAppZone(value: string): Date {
  const utcMidnight = dateOnlyToDate(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(wallClockFormatter.formatToParts(utcMidnight).find((item) => item.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return new Date(utcMidnight.getTime() + (utcMidnight.getTime() - wallClockAsUtc));
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: APP_TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

// Hora de agora no relógio de São Paulo, como 'HH:MM'.
export function nowTimeInAppZone(now: Date = new Date()): string {
  return timeFormatter.format(now);
}

// Um TIME do Postgres chega ao Prisma como Date em 1970-01-01, no UTC. Como no DATE, a conversão
// entre 'HH:MM' e Date é feita em UTC: a hora guardada é a do relógio de São Paulo, sem fuso.
export function timeOnlyToDate(value: string): Date {
  return new Date(`1970-01-01T${value}:00.000Z`);
}

export function dateToTimeOnly(value: Date): string {
  return value.toISOString().slice(11, 16);
}
