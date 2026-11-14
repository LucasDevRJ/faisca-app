import { api } from '../../lib/api';
import type { Action } from '../actions/actions-api';
import type { Activity } from '../activities/activities-api';
import type { AgendaResponse, AgendaStatus, DateRange, Pause } from '../appointments/appointments-api';
import type { CycleResponse } from '../cycle/cycle-api';
import type { ProfessionalKind, SharedArea } from '../links/links-api';
import type { Plan, PlanEntry, PlanInput } from '../plans/plans-api';
import type { TensionEpisode } from '../tension-episodes/tension-episodes-api';
import type { ThoughtRecord } from '../thought-records/thought-records-api';
import type { WithRead } from './read-marks-api';

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
  patient: { id: string; name: string; email: string; linkedAt: string; avatarVersion: string | null };
  // O "hoje" da API, no fuso de São Paulo: a tela usa o mesmo dia do destaque.
  today: string;
  // Só quando e de que tipo: os motivos ficam na agenda, que pede o aceite (DEC-045).
  lastAppointment: SessionWhen | null;
  nextAppointment: SessionWhen | null;
  // Situação da agenda, para o selo "em pausa" ou "encerrada"; null sem a agenda liberada (DEC-097).
  agendaStatus: AgendaStatus | null;
  pause: Pause | null;
  highlight: Highlight;
  // O tipo do vínculo e as áreas que o paciente liberou para esta profissional (DEC-097).
  access: { kind: ProfessionalKind; sharedAreas: SharedArea[] };
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
// Pensamentos, Tensão e Ação vêm com o status de leitura desta terapeuta (DEC-057).
export async function fetchPatientThoughtRecords(
  patientId: string,
  from: string,
  to: string,
): Promise<WithRead<ThoughtRecord>[]> {
  const { data } = await api.get<{ thoughtRecords: WithRead<ThoughtRecord>[] }>(`${base(patientId)}/thought-records`, {
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
export async function fetchPatientTensionEpisodes(
  patientId: string,
  from: string,
  to: string,
): Promise<WithRead<TensionEpisode>[]> {
  const { data } = await api.get<{ tensionEpisodes: WithRead<TensionEpisode>[] }>(`${base(patientId)}/tension-episodes`, {
    params: { from, to },
  });
  return data.tensionEpisodes;
}

// Ciclo da consulta do paciente (DEC-049): só dias e horas, sem pedir o aceite da agenda.
export async function fetchPatientCycle(patientId: string, date?: string): Promise<CycleResponse> {
  const { data } = await api.get<CycleResponse>(`${base(patientId)}/cycle`, { params: date ? { date } : undefined });
  return data;
}

// Meus Planos (DEC-094): os planos do paciente, ativos e encerrados, e os registros de um plano,
// com o status de leitura desta terapeuta. Pedem a versão do aviso que os cita.
export async function fetchPatientPlans(patientId: string): Promise<Plan[]> {
  const { data } = await api.get<{ plans: Plan[] }>(`${base(patientId)}/plans`);
  return data.plans;
}

// Única escrita de dado de paciente pela psicóloga (DEC-102): cria o plano para a conta do paciente.
export async function createPatientPlan(patientId: string, input: PlanInput): Promise<Plan> {
  const { data } = await api.post<{ plan: Plan }>(`${base(patientId)}/plans`, input);
  return data.plan;
}

export async function fetchPatientPlanEntries(
  patientId: string,
  planId: string,
  from: string,
  to: string,
): Promise<WithRead<PlanEntry>[]> {
  const { data } = await api.get<{ entries: WithRead<PlanEntry>[] }>(`${base(patientId)}/plans/${planId}/entries`, {
    params: { from, to },
  });
  return data.entries;
}

// Ação (DEC-051): pede a versão do aviso que a cita, aceita pela terapeuta.
export async function fetchPatientActions(patientId: string, from: string, to: string): Promise<WithRead<Action>[]> {
  const { data } = await api.get<{ actions: WithRead<Action>[] }>(`${base(patientId)}/actions`, { params: { from, to } });
  return data.actions;
}
