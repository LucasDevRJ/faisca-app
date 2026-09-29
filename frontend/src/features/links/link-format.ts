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

// '2026-09-29T01:15:00.000Z' → '28/09, 22:15'
export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

// '2026-09-29T01:15:00.000Z' → '28/09/2026'
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}
