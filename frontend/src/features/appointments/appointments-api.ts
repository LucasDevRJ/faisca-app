import { api } from '../../lib/api';

// Chamadas às rotas /appointments: a agenda de consultas (DEC-030, DEC-045). O dono vem da
// sessão, nunca do front.

export type Frequency = 'SEMANAL' | 'QUINZENAL';
export type AgendaStatus = 'SEM_AGENDA' | 'ATIVA' | 'PAUSADA' | 'ENCERRADA';

// Uma sessão calculada pela API: da agenda (RECORRENTE, remarcada ou não) ou avulsa.
export type Session = {
  kind: 'RECORRENTE' | 'AVULSA';
  date: string;
  // null só nas consultas de antes da agenda, que não tinham hora.
  time: string | null;
  status: 'AGENDADA' | 'DESMARCADA';
  // Dia em que a sessão cairia pela agenda: identifica a sessão para desmarcar, remarcar e desfazer.
  originalDate: string | null;
  rescheduled: boolean;
  reason: string | null;
  // Só nas avulsas: o id para mudar ou excluir.
  appointmentId: string | null;
};

export type Schedule = { startDate: string; time: string; frequency: Frequency };
export type Pause = { startDate: string; returnDate: string | null };

// "Última" e "próxima" vêm calculadas pela API, com dia e hora, no fuso de São Paulo.
export type AgendaResponse = {
  status: AgendaStatus;
  schedule: Schedule | null;
  pause: Pause | null;
  from: string;
  to: string;
  sessions: Session[];
  upcoming: Session[];
  last: Session | null;
  next: Session | null;
};

export type DateRange = { from: string; to: string };

// Arquivo .ics com as próximas sessões, para o calendário do celular. O cookie vai junto.
export const CALENDAR_URL = '/api/appointments/calendar.ics';

// Dias com sessão agendada (o selo "consulta" na semana). Desmarcadas não contam.
export function sessionDays(agenda: AgendaResponse | undefined): string[] {
  return agenda?.sessions.filter((s) => s.status === 'AGENDADA').map((s) => s.date) ?? [];
}

export async function fetchAgenda(range?: DateRange): Promise<AgendaResponse> {
  const { data } = await api.get<AgendaResponse>('/appointments', { params: range });
  return data;
}

export type ExtraInput = { appointmentDate: string; appointmentTime: string };

export async function createExtra(input: ExtraInput): Promise<void> {
  await api.post('/appointments', input);
}

export async function updateExtra(id: string, input: ExtraInput): Promise<void> {
  await api.patch(`/appointments/${id}`, input);
}

export async function deleteExtra(id: string): Promise<void> {
  await api.delete(`/appointments/${id}`);
}

export async function setSchedule(input: Schedule): Promise<void> {
  await api.put('/appointments/schedule', input);
}

export async function endSchedule(): Promise<void> {
  await api.post('/appointments/schedule/end');
}

export async function pauseAgenda(input: Pause): Promise<void> {
  await api.post('/appointments/pause', input);
}

export async function resumeAgenda(): Promise<void> {
  await api.post('/appointments/pause/resume');
}

export async function cancelSession(originalDate: string, reason: string): Promise<void> {
  await api.post(`/appointments/sessions/${originalDate}/cancel`, { reason });
}

export type RescheduleInput = { originalDate: string; date: string; time: string; reason: string };

export async function rescheduleSession({ originalDate, ...input }: RescheduleInput): Promise<void> {
  await api.post(`/appointments/sessions/${originalDate}/reschedule`, input);
}

export async function undoSessionChange(originalDate: string): Promise<void> {
  await api.delete(`/appointments/sessions/${originalDate}/change`);
}
