import { skipToken, useQuery } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import {
  fetchPatientActivities,
  fetchPatientAppointments,
  fetchPatientSummary,
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

export function usePatientAppointments(patientId: string) {
  return useQuery({
    queryKey: [...THERAPIST_KEY, patientId, 'appointments'],
    queryFn: () => fetchPatientAppointments(patientId),
    retry: retryUnlessForbidden,
  });
}
