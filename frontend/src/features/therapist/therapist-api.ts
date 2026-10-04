import { api } from '../../lib/api';
import type { Activity } from '../activities/activities-api';
import type { AgendaResponse, AgendaStatus, DateRange, Pause } from '../appointments/appointments-api';
import type { TensionEpisode } from '../tension-episodes/tension-episodes-api';
import type { ThoughtRecord } from '../thought-records/thought-records-api';

// Visão da terapeuta (DEC-033): só leitura, sob /therapist/patients/:patientId. O backend confere
// o vínculo a cada chamada; sem vínculo ativo, tudo aqui volta 403.

export type Highlight = {
  from: string;
  to: string;
  // A semana antes da próxima consulta ou, sem ela, os últimos 7 dias.
  reason: 'NEXT_APPOINTMENT' | 'LAST_7_DAYS';
};

export type SessionWhen = { date: string; time: string | null; kind: 'RECORRENTE' | 'AVULSA' };

export type PatientSummary = {
  patient: { id: string; name: string; email: string; linkedAt: string };
  // O "hoje" da API, no fuso de São Paulo: a tela usa o mesmo dia do destaque.
  today: string;
  // Só quando e de que tipo: os motivos ficam na agenda, que pede o aceite (DEC-045).
  lastAppointment: SessionWhen | null;
  nextAppointment: SessionWhen | null;
  // Situação da agenda, para o selo "em pausa" ou "encerrada".
  agendaStatus: AgendaStatus;
  pause: Pause | null;
  highlight: Highlight;
};

// A terapeuta pede até 92 dias de atividades por vez (o paciente, 42).
export const THERAPIST_MAX_DAYS = 92;

const base = (patientId: string) => `/therapist/patients/${patientId}`;

export async function fetchPatientSummary(patientId: string): Promise<PatientSummary> {
  const { data } = await api.get<PatientSummary>(base(patientId));
  return data;
}

export async function fetchPatientActivities(patientId: string, from: string, to: string): Promise<Activity[]> {
  const { data } = await api.get<{ activities: Activity[] }>(`${base(patientId)}/activities`, {
    params: { from, to },
  });
  return data.activities;
}

// Registro de Pensamentos (DEC-039): também pede a versão atual do aviso aceita pela terapeuta.
export async function fetchPatientThoughtRecords(patientId: string, from: string, to: string): Promise<ThoughtRecord[]> {
  const { data } = await api.get<{ thoughtRecords: ThoughtRecord[] }>(`${base(patientId)}/thought-records`, {
    params: { from, to },
  });
  return data.thoughtRecords;
}

// Agenda com os motivos (DEC-045): pede a versão do aviso que a cita, aceita pela terapeuta.
export async function fetchPatientAppointments(patientId: string, range?: DateRange): Promise<AgendaResponse> {
  const { data } = await api.get<AgendaResponse>(`${base(patientId)}/appointments`, { params: range });
  return data;
}

// Episódios de tensão (DEC-042): pedem a versão do aviso que os cita, aceita pela terapeuta.
export async function fetchPatientTensionEpisodes(patientId: string, from: string, to: string): Promise<TensionEpisode[]> {
  const { data } = await api.get<{ tensionEpisodes: TensionEpisode[] }>(`${base(patientId)}/tension-episodes`, {
    params: { from, to },
  });
  return data.tensionEpisodes;
}
