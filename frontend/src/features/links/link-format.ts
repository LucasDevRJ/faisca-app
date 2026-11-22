import { todayInAppZone } from '../activities/week';

// Datas do vínculo no fuso de São Paulo (DEC-007), com Intl, sem biblioteca (DEC-029).

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeYearFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// '2026-09-29T01:15:00.000Z' → '28/09, 22:15'; de outro ano (DEC-120), '28/09/2025, 22:15'.
export function formatDateTime(iso: string, today: string = todayInAppZone()): string {
  const date = new Date(iso);
  const otherYear = todayInAppZone(date).slice(0, 4) !== today.slice(0, 4);
  return (otherYear ? dateTimeYearFormatter : dateTimeFormatter).format(date);
}

// '2026-09-29T01:15:00.000Z' → '28/09/2026'
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
