import { api } from '../../lib/api';
import type { DateRange } from '../appointments/appointments-api';

// Sono, humor e remédio (DEC-107, DEC-108). Um registro por dia; a noite pertence ao dia em que a
// pessoa acordou. O paciente registra e edita os últimos 7 dias.

export type MedicationTaken = 'TOMOU' | 'ESQUECEU_ALGUM' | 'NAO_TOMOU';

export type CheckIn = {
  date: string;
  bedTime: string | null;
  wakeTime: string | null;
  // Calculado pela API a partir dos dois horários.
  sleepMinutes: number | null;
  sleepQuality: number | null;
  mood: number | null;
  moodWord: string | null;
  medication: MedicationTaken | null;
  editable: boolean;
};

export type CheckInInput = {
  bedTime: string | null;
  wakeTime: string | null;
  sleepQuality: number | null;
  mood: number | null;
  moodWord: string | null;
  medication: MedicationTaken | null;
};

export type CheckInsResponse = { checkIns: CheckIn[]; tracksMedication: boolean };

// O front nunca manda o id: a API usa a sessão.
export async function fetchCheckIns({ from, to }: DateRange): Promise<CheckInsResponse> {
  const { data } = await api.get<CheckInsResponse>('/daily-check-ins', { params: { from, to } });
  return data;
}

export async function saveCheckIn(date: string, input: CheckInInput): Promise<CheckIn> {
  const { data } = await api.put<{ checkIn: CheckIn }>(`/daily-check-ins/${date}`, input);
  return data.checkIn;
}

export async function deleteCheckIn(date: string): Promise<void> {
  await api.delete(`/daily-check-ins/${date}`);
}

export async function updateCheckInSettings(tracksMedication: boolean): Promise<{ tracksMedication: boolean }> {
  const { data } = await api.put<{ tracksMedication: boolean }>('/daily-check-ins/settings', { tracksMedication });
  return data;
}

// Na profissional: só leitura, e cada parte só com a caixa liberada (a API já tira o resto).
export async function fetchPatientCheckIns(patientId: string, { from, to }: DateRange): Promise<CheckIn[]> {
  const { data } = await api.get<{ checkIns: CheckIn[] }>(`/therapist/patients/${patientId}/daily-check-ins`, {
    params: { from, to },
  });
  return data.checkIns;
}
