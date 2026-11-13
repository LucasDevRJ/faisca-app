import { skipToken, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { fetchPatientAboutMe } from '../about-me/about-me-api';
import { PATIENTS_KEY } from '../links/use-links';
import { fetchPatientPeriodSummary } from '../summary/summary-api';
import { fetchPatientUnread, markRead, unmarkRead, type ReadItem } from './read-marks-api';
import type { CycleResponse } from '../cycle/cycle-api';
import { getApiError } from '../auth/auth-api';
import {
  fetchPatientActions,
  fetchPatientActivities,
  fetchPatientAppointments,
  fetchPatientCycle,
  fetchPatientPlanEntries,
  fetchPatientPlans,
  fetchPatientSummary,
  fetchPatientTensionEpisodes,
  fetchPatientThoughtRecords,
} from './therapist-api';

const THERAPIST_KEY = ['therapist'] as const;

// 403 é resposta definitiva (vínculo desfeito ou inexistente): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

export function isForbidden(error: unknown): boolean {
  return getApiError(error).status === 403;
}

// Os registros para ler (DEC-058). enabled = false quando a terapeuta não aceitou nenhuma das
// três áreas: nem pergunta.
export function usePatientUnread(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'unread'],
    queryFn: enabled ? () => fetchPatientUnread(patientId) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Marcar ou desmarcar como lido. Depois, recarrega as listas, os registros para ler e o contador
// da lista de pacientes.
export function useReadMarks(patientId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [...THERAPIST_KEY, patientId] }),
      queryClient.invalidateQueries({ queryKey: PATIENTS_KEY }),
    ]);
  const mark = useMutation({ mutationFn: (items: ReadItem[]) => markRead(patientId, items), onSettled: refresh });
  const unmark = useMutation({ mutationFn: (items: ReadItem[]) => unmarkRead(patientId, items), onSettled: refresh });
  return { mark, unmark };
}

// "Sobre mim" do paciente (DEC-081): só com o aceite da versão do aviso que o cita.
export function usePatientAboutMe(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'about-me'],
    queryFn: enabled ? () => fetchPatientAboutMe(patientId) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// O resumo traz as áreas que o paciente liberou (DEC-097), que mudam a qualquer momento: sem os 30 s
// de folga do padrão, abrir a página pergunta de novo (um resumo da lista não serve de base).
export function usePatientSummary(patientId: string) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'summary'],
    queryFn: () => fetchPatientSummary(patientId),
    retry: retryUnlessForbidden,
    staleTime: 0,
  });
}

// Resumo do período em números (DEC-100): só as áreas liberadas e com o aceite dela; as fechadas vêm
// como null. range = null enquanto o período não é conhecido.
export function usePatientPeriodSummary(patientId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'period-summary', range?.from, range?.to],
    queryFn: range ? () => fetchPatientPeriodSummary(patientId, range) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Só busca quando o período já é conhecido (depende do resumo, no filtro "desde a última consulta").
export function usePatientActivities(patientId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'activities', range?.from, range?.to],
    queryFn: range ? () => fetchPatientActivities(patientId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// range null = aba fechada ou sem o aceite do aviso: não pergunta à API.
export function usePatientThoughtRecords(patientId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'thought-records', range?.from, range?.to],
    queryFn: range ? () => fetchPatientThoughtRecords(patientId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// range null = aba fechada ou sem o aceite do aviso: não pergunta à API.
export function usePatientTensionEpisodes(patientId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'tension-episodes', range?.from, range?.to],
    queryFn: range ? () => fetchPatientTensionEpisodes(patientId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Sem o aceite da agenda, nem pergunta (a API responderia 403).
export function usePatientAppointments(patientId: string, enabled: boolean, range?: { from: string; to: string }) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'appointments', range?.from ?? null, range?.to ?? null],
    queryFn: enabled ? () => fetchPatientAppointments(patientId, range) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Ciclo da consulta do paciente (DEC-049), no formato que o usePeriod pede.
// enabled = false sem a agenda liberada pelo paciente (DEC-097): sem pedir à API, responde "sem
// ciclo" na hora, e a tela usa a semana.
export function patientCycleQuery(patientId: string, enabled = true) {
  return (date: string | null): UseQueryOptions<CycleResponse> => ({
    queryKey: [...THERAPIST_KEY, patientId, 'cycle', enabled, date],
    queryFn: enabled
      ? () => fetchPatientCycle(patientId, date ?? undefined)
      : async () => ({ today: '', cycle: null }) as unknown as CycleResponse,
    retry: retryUnlessForbidden,
  });
}

// range null = aba fechada ou sem o aceite do aviso: não pergunta à API.
export function usePatientActions(patientId: string, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'actions', range?.from, range?.to],
    queryFn: range ? () => fetchPatientActions(patientId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}

// Meus Planos (DEC-094): os planos do paciente, para decidir se a aba aparece e para escolher um.
export function usePatientPlans(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'plans'],
    queryFn: enabled ? () => fetchPatientPlans(patientId) : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function usePatientPlanEntries(patientId: string, planId: string | null, range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'plan-entries', planId, range?.from, range?.to],
    queryFn: planId && range ? () => fetchPatientPlanEntries(patientId, planId, range.from, range.to) : skipToken,
    retry: retryUnlessForbidden,
  });
}
