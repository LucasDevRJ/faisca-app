import { api } from '../../lib/api';

// Chamadas às rotas /appointments (DEC-030). O dono vem da sessão, nunca do front.

export type Appointment = {
  id: string;
  appointmentDate: string;
  createdAt: string;
  updatedAt: string;
};

// "Última" e "próxima" vêm calculadas pela API, no fuso de São Paulo (SPEC, Consultas).
export type AppointmentsResponse = {
  appointments: Appointment[];
  last: Appointment | null;
  next: Appointment | null;
};

export async function fetchAppointments(): Promise<AppointmentsResponse> {
  const { data } = await api.get<AppointmentsResponse>('/appointments');
  return data;
}

export async function createAppointment(appointmentDate: string): Promise<Appointment> {
  const { data } = await api.post<{ appointment: Appointment }>('/appointments', { appointmentDate });
  return data.appointment;
}

export async function updateAppointment(id: string, appointmentDate: string): Promise<Appointment> {
  const { data } = await api.patch<{ appointment: Appointment }>(`/appointments/${id}`, { appointmentDate });
  return data.appointment;
}

export async function deleteAppointment(id: string): Promise<void> {
  await api.delete(`/appointments/${id}`);
}
