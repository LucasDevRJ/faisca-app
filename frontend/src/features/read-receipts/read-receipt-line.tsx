import type { ReadType } from '../therapist/read-marks-api';
import { readReceiptText } from './read-receipt-format';
import { receiptsOf, useReadReceipts } from './use-read-receipts';

// "Lido pela sua psicóloga em 12/11" no cartão do paciente (DEC-118). Discreto, sem ícone nem cor, e
// só quando há leitura: nunca "não lido" nem o que falta ler. Sem nada, não ocupa espaço.

export function ReadReceiptLine({ type, id }: { type: ReadType; id: string }) {
  const { data } = useReadReceipts();
  const text = readReceiptText(receiptsOf(data, type, id));
  if (!text) return null;
  return <p className="text-sm text-muted">{text}</p>;
}
