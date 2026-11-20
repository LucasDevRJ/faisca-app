import { formatDayMonth, todayInAppZone } from '../activities/week';
import type { ProfessionalKind } from '../links/links-api';
import type { ReadReceipt } from './use-read-receipts';

// Texto do "Lido" para o paciente (DEC-118).
const BY_KIND: Record<ProfessionalKind, string> = {
  PSICOLOGIA: 'pela sua psicóloga',
  PSIQUIATRIA: 'pela sua psiquiatra',
};

function when(receipt: ReadReceipt): string {
  return `${BY_KIND[receipt.kind]} em ${formatDayMonth(todayInAppZone(new Date(receipt.readAt)))}`;
}

// "Lido pela sua psicóloga em 12/11" ou "Lido pela sua psicóloga em 12/11 e pela sua psiquiatra em 13/11".
export function readReceiptText(receipts: ReadReceipt[]): string | null {
  if (receipts.length === 0) return null;
  return `Lido ${receipts.map(when).join(' e ')}`;
}
