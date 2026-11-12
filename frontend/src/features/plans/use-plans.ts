import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import {
  createPlan,
  createPlanEntry,
  deletePlan,
  deletePlanEntry,
  fetchPlan,
  fetchPlanEntries,
  fetchPlanEntry,
  fetchPlans,
  updatePlan,
  updatePlanEntry,
  type PlanEntryInput,
  type PlanInput,
} from './plans-api';

export const PLANS_KEY = ['plans'] as const;

// 403 é resposta definitiva (sem aceite do aviso ou sem acesso): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

// enabled = false enquanto a pessoa não aceitou a versão do aviso que cita o Meus Planos.
export function usePlans(enabled: boolean) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'list'],
    queryFn: enabled ? fetchPlans : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function usePlan(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'one', id],
    queryFn: enabled ? () => fetchPlan(id) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Registros de um plano num período: a semana ou o ciclo da consulta (DEC-050).
export function usePlanEntries(planId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'entries', planId, range?.from, range?.to],
    queryFn: range ? () => fetchPlanEntries(planId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function usePlanEntry(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...PLANS_KEY, 'entry', id],
    queryFn: enabled ? () => fetchPlanEntry(id) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Toda gravação recarrega o que estiver em memória, mesmo depois de erro (ex.: 409 de prazo).
function usePlanMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useCreatePlan() {
  return usePlanMutation((input: PlanInput) => createPlan(input));
}

export function useUpdatePlan() {
  return usePlanMutation(({ id, input }: { id: string; input: Partial<PlanInput> & { archived?: boolean } }) =>
    updatePlan(id, input),
  );
}

export function useDeletePlan() {
  return usePlanMutation((id: string) => deletePlan(id));
}

export function useCreatePlanEntry() {
  return usePlanMutation(({ planId, input }: { planId: string; input: PlanEntryInput }) =>
    createPlanEntry(planId, input),
  );
}

export function useUpdatePlanEntry() {
  return usePlanMutation(({ id, input }: { id: string; input: PlanEntryInput }) => updatePlanEntry(id, input));
}

export function useDeletePlanEntry() {
  return usePlanMutation((id: string) => deletePlanEntry(id));
}
