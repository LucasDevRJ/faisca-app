import { api } from '../../lib/api';
import type { Activity } from '../activities/activities-api';
import type { Appointment, AppointmentsResponse } from '../appointments/appointments-api';

// Visão da terapeuta (DEC-033): só leitura, sob /therapist/patients/:patientId. O backend confere
// o vínculo a cada chamada; sem vínculo ativo, tudo aqui volta 403.

export type Highlight = {
  from: string;
  to: string;
  // A semana antes da próxima consulta ou, sem ela, os últimos 7 dias.
  reason: 'NEXT_APPOINTMENT' | 'LAST_7_DAYS';
};

export type PatientSummary = {
  patient: { id: string; name: string; email: string; linkedAt: string };
  // O "hoje" da API, no fuso de São Paulo: a tela usa o mesmo dia do destaque.
  today: string;
  lastAppointment: Appointment | null;
  nextAppointment: Appointment | null;
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

export async function fetchPatientAppointments(patientId: string): Promise<AppointmentsResponse> {
  const { data } = await api.get<AppointmentsResponse>(`${base(patientId)}/appointments`);
  return data;
}
