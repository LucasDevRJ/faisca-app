import type { UseQueryOptions } from '@tanstack/react-query';
import { fetchCycle, type CycleResponse } from './cycle-api';

// Ciclo do próprio paciente que contém o dia (sem dia, o de hoje). A chave fica sob
// ['appointments']: mudar a agenda recalcula o ciclo junto (DEC-049).
export function cycleQuery(date: string | null): UseQueryOptions<CycleResponse> {
  return {
    queryKey: ['appointments', 'cycle', date],
    queryFn: () => fetchCycle(date ?? undefined),
  };
}
