import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import { addDays } from '../activities/week';
import {
  createThoughtRecord,
  deleteThoughtRecord,
  fetchThoughtRecord,
  fetchThoughtRecords,
  updateThoughtRecord,
  type ThoughtRecordInput,
} from './thought-records-api';

export const THOUGHT_RECORDS_KEY = ['thought-records'] as const;

// 403 é resposta definitiva (sem aceite do aviso ou sem acesso): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

// A API pede o novo aceite do aviso de privacidade (DEC-039).
export function needsPrivacyConsent(error: unknown): boolean {
  return getApiError(error).code === 'PRIVACY_CONSENT_REQUIRED';
}

// enabled = false enquanto a pessoa não aceitou a versão atual do aviso: nem pergunta à API.
// Registros de um período: a semana ou o ciclo da consulta (DEC-050).
export function useRangeThoughtRecords({ from, to }: { from: string; to: string }, enabled: boolean) {
  return useQuery({
    queryKey: [...THOUGHT_RECORDS_KEY, 'week', from, to],
    queryFn: enabled ? () => fetchThoughtRecords(from, to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function useWeekThoughtRecords(monday: string, enabled: boolean) {
  return useRangeThoughtRecords({ from: monday, to: addDays(monday, 6) }, enabled);
}

export function useThoughtRecord(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...THOUGHT_RECORDS_KEY, 'one', id],
    queryFn: enabled ? () => fetchThoughtRecord(id) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Toda gravação recarrega o que estiver em memória, mesmo depois de erro (ex.: 409 de prazo).
function useThoughtRecordMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: THOUGHT_RECORDS_KEY }),
  });
}

export function useCreateThoughtRecord() {
  return useThoughtRecordMutation((input: ThoughtRecordInput) => createThoughtRecord(input));
}

export function useUpdateThoughtRecord() {
  return useThoughtRecordMutation(({ id, input }: { id: string; input: ThoughtRecordInput }) =>
    updateThoughtRecord(id, input),
  );
}

export function useDeleteThoughtRecord() {
  return useThoughtRecordMutation((id: string) => deleteThoughtRecord(id));
}
