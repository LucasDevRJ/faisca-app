import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import { addDays } from '../activities/week';
import {
  createTensionEpisode,
  deleteTensionEpisode,
  fetchTensionEpisode,
  fetchTensionEpisodes,
  updateTensionEpisode,
  type TensionEpisodeInput,
} from './tension-episodes-api';

export const TENSION_EPISODES_KEY = ['tension-episodes'] as const;

// 403 é resposta definitiva (sem aceite do aviso ou sem acesso): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

// enabled = false enquanto a pessoa não aceitou a versão do aviso que cita os episódios.
// Episódios de um período: a semana ou o ciclo da consulta (DEC-050).
export function useRangeTensionEpisodes({ from, to }: { from: string; to: string }, enabled: boolean) {
  return useQuery({
    queryKey: [...TENSION_EPISODES_KEY, 'week', from, to],
    queryFn: enabled ? () => fetchTensionEpisodes(from, to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function useWeekTensionEpisodes(monday: string, enabled: boolean) {
  return useRangeTensionEpisodes({ from: monday, to: addDays(monday, 6) }, enabled);
}

export function useTensionEpisode(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...TENSION_EPISODES_KEY, 'one', id],
    queryFn: enabled ? () => fetchTensionEpisode(id) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Toda gravação recarrega o que estiver em memória, mesmo depois de erro (ex.: 409 de prazo).
function useTensionEpisodeMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: TENSION_EPISODES_KEY }),
  });
}

export function useCreateTensionEpisode() {
  return useTensionEpisodeMutation((input: TensionEpisodeInput) => createTensionEpisode(input));
}

export function useUpdateTensionEpisode() {
  return useTensionEpisodeMutation(({ id, input }: { id: string; input: TensionEpisodeInput }) =>
    updateTensionEpisode(id, input),
  );
}

export function useDeleteTensionEpisode() {
  return useTensionEpisodeMutation((id: string) => deleteTensionEpisode(id));
}
