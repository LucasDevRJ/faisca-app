import { skipToken, useQuery } from '@tanstack/react-query';
import type { DateRange } from '../appointments/appointments-api';
import { fetchMyPeriodSummary } from './summary-api';

export const MY_PERIOD_SUMMARY_KEY = ['period-summary'] as const;

// "Meu resumo" (DEC-100). Só pergunta com o cartão aberto. Sem os 30 s de folga do padrão: registros
// feitos em outra tela (pensamentos, tensão, Ação) entram ao voltar para cá.
export function useMyPeriodSummary(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: [...MY_PERIOD_SUMMARY_KEY, range.from, range.to],
    queryFn: enabled ? () => fetchMyPeriodSummary(range) : skipToken,
    staleTime: 0,
  });
}
