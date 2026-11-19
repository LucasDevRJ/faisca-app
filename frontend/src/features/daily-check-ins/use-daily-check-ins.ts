import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DateRange } from '../appointments/appointments-api';
import { getApiError } from '../auth/auth-api';
import { MY_PERIOD_SUMMARY_KEY } from '../summary/use-summary';
import {
  deleteCheckIn,
  fetchCheckIns,
  saveCheckIn,
  updateCheckInSettings,
  type CheckInInput,
} from './daily-check-ins-api';

export const CHECK_INS_KEY = ['daily-check-ins'] as const;

// 403 é resposta definitiva (sem o aceite): tentar de novo não adianta.
const retry = (count: number, error: unknown) => getApiError(error).status !== 403 && count < 1;

// enabled = false sem o aceite do aviso que cita o Sono e humor: nem pergunta à API.
export function useCheckIns(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: [...CHECK_INS_KEY, range.from, range.to],
    queryFn: enabled ? () => fetchCheckIns(range) : skipToken,
    retry,
  });
}

// Toda gravação recarrega os dias e o "Meu resumo", mesmo depois de erro.
function useCheckInMutation<I, O>(mutationFn: (input: I) => Promise<O>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: CHECK_INS_KEY }),
        client.invalidateQueries({ queryKey: MY_PERIOD_SUMMARY_KEY }),
      ]),
  });
}

export const useSaveCheckIn = () =>
  useCheckInMutation(({ date, input }: { date: string; input: CheckInInput }) => saveCheckIn(date, input));
export const useDeleteCheckIn = () => useCheckInMutation(deleteCheckIn);
export const useCheckInSettings = () => useCheckInMutation(updateCheckInSettings);
