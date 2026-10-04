import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import {
  createAction,
  deleteAction,
  evaluateAction,
  fetchAction,
  fetchActions,
  markActionNotDone,
  updateAction,
  type CreateActionInput,
  type EvaluateActionInput,
  type UpdateActionInput,
} from './actions-api';

export const ACTIONS_KEY = ['actions'] as const;

// 403 é resposta definitiva (sem aceite do aviso ou sem acesso): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

// enabled = false enquanto a pessoa não aceitou a versão do aviso que cita a Ação.
export function useRangeActions({ from, to }: { from: string; to: string }, enabled: boolean) {
  return useQuery({
    queryKey: [...ACTIONS_KEY, 'range', from, to],
    queryFn: enabled ? () => fetchActions(from, to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function useAction(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...ACTIONS_KEY, 'one', id],
    queryFn: enabled ? () => fetchAction(id) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Toda gravação recarrega o que estiver em memória, mesmo depois de erro (ex.: 409 de ação final).
function useActionMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ACTIONS_KEY }),
  });
}

export const useCreateAction = () => useActionMutation((input: CreateActionInput) => createAction(input));
export const useUpdateAction = () =>
  useActionMutation(({ id, input }: { id: string; input: UpdateActionInput }) => updateAction(id, input));
export const useEvaluateAction = () =>
  useActionMutation(({ id, input }: { id: string; input: EvaluateActionInput }) => evaluateAction(id, input));
export const useMarkActionNotDone = () =>
  useActionMutation(({ id, observation }: { id: string; observation?: string }) => markActionNotDone(id, observation));
export const useDeleteAction = () => useActionMutation((id: string) => deleteAction(id));
