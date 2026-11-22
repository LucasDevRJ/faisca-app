import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../auth/use-session';
import type { ProfessionalKind } from '../links/links-api';
import { READ_RECEIPTS_KEY } from '../links/use-links';
import type { ReadType } from '../therapist/read-marks-api';

// "Lido" para o paciente (DEC-117, DEC-118): as leituras que ele pode ver, de quem ativou. Só vêm as
// leituras em dia, das áreas que ele libera hoje e do vínculo atual; a API traz o tipo da profissional,
// nunca quem é.
export type ReadReceipt = { type: ReadType; id: string; readAt: string; kind: ProfessionalKind };

async function fetchReadReceipts(): Promise<ReadReceipt[]> {
  const { data } = await api.get<{ receipts: ReadReceipt[] }>('/read-receipts');
  return data.receipts;
}

// Um pedido só para todos os cartões da tela. Sem o aceite do aviso que cita o recurso, nem pergunta.
export function useReadReceipts() {
  const { data: user } = useSession();
  const enabled = Boolean(user?.profiles.patient && user.privacyAreas.readReceipts);
  return useQuery({ queryKey: READ_RECEIPTS_KEY, queryFn: fetchReadReceipts, enabled, staleTime: 60_000 });
}

// As leituras de um registro, a psicóloga primeiro.
export function receiptsOf(receipts: ReadReceipt[] | undefined, type: ReadType, id: string): ReadReceipt[] {
  return (receipts ?? [])
    .filter((receipt) => receipt.type === type && receipt.id === id)
    .sort((a, b) => a.kind.localeCompare(b.kind));
}
