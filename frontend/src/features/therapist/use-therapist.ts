import { skipToken, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { CycleResponse } from '../cycle/cycle-api';
import { getApiError } from '../auth/auth-api';
import {
  fetchPatientActivities,
  fetchPatientAppointments,
  fetchPatientCycle,
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

export function usePatientSummary(patientId: string) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'summary'],
    queryFn: () => fetchPatientSummary(patientId),
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
export function patientCycleQuery(patientId: string) {
  return (date: string | null): UseQueryOptions<CycleResponse> => ({
    queryKey: [...THERAPIST_KEY, patientId, 'cycle', date],
    queryFn: () => fetchPatientCycle(patientId, date ?? undefined),
    retry: retryUnlessForbidden,
  });
}
