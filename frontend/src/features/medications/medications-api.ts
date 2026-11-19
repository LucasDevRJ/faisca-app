import { api } from '../../lib/api';

// Remédios e o que sinto (DEC-114, DEC-115). Tudo é anotação do paciente: o Faísca guarda o que ele
// conta e não avalia remédio nem sintoma. O front nunca manda o id: a API usa a sessão.

export type ChangeKind = 'COMECOU' | 'MUDOU_DOSE' | 'PAROU';

export type MedicationChange = {
  id: string;
  kind: ChangeKind;
  changeDate: string;
  dose: string | null;
  note: string | null;
};

export type Medication = {
  id: string;
  name: string;
  schedule: string | null;
  // A dose atual, enquanto está em uso.
  dose: string | null;
  active: boolean;
  startedOn: string | null;
  stoppedOn: string | null;
  // Da mais antiga para a mais nova.
  changes: MedicationChange[];
  createdAt: string;
  updatedAt: string;
};

export type Symptom = {
  id: string;
  description: string;
  startedOn: string;
  endedOn: string | null;
  medicationId: string | null;
  note: string | null;
  // Quantos dias depois da última mudança do remédio ligado o sintoma começou.
  sinceChange: { medicationId: string; kind: ChangeKind; date: string; days: number } | null;
  // "Como está agora", da mais antiga para a mais nova.
  checks: { date: string; intensity: number }[];
  createdAt: string;
  updatedAt: string;
};

export type MedicationsData = { medications: Medication[]; symptoms: Symptom[] };
export type MedicationsResponse = MedicationsData & { listsMedications: boolean };

export type MedicationInput = { name: string; dose: string | null; schedule: string | null; startedOn: string };
export type MedicationUpdate = { name?: string; schedule?: string | null };
export type ChangeInput = { kind: ChangeKind; changeDate: string; dose: string | null; note: string | null };
export type ChangeUpdate = { changeDate?: string; dose?: string | null; note?: string | null };
export type SymptomInput = {
  description: string;
  startedOn: string;
  intensity: number | null;
  medicationId: string | null;
  note: string | null;
};
export type SymptomUpdate = {
  description?: string;
  startedOn?: string;
  endedOn?: string | null;
  medicationId?: string | null;
  note?: string | null;
};

export async function fetchMedications(): Promise<MedicationsResponse> {
  const { data } = await api.get<MedicationsResponse>('/medications');
  return data;
}

export async function updateMedicationsSettings(listsMedications: boolean): Promise<{ listsMedications: boolean }> {
  const { data } = await api.put<{ listsMedications: boolean }>('/medications/settings', { listsMedications });
  return data;
}

export async function createMedication(input: MedicationInput): Promise<Medication> {
  const { data } = await api.post<{ medication: Medication }>('/medications', input);
  return data.medication;
}

export async function updateMedication(id: string, input: MedicationUpdate): Promise<Medication> {
  const { data } = await api.patch<{ medication: Medication }>(`/medications/${id}`, input);
  return data.medication;
}

export async function deleteMedication(id: string): Promise<void> {
  await api.delete(`/medications/${id}`);
}

export async function addChange(id: string, input: ChangeInput): Promise<Medication> {
  const { data } = await api.post<{ medication: Medication }>(`/medications/${id}/changes`, input);
  return data.medication;
}

export async function updateChange(id: string, changeId: string, input: ChangeUpdate): Promise<Medication> {
  const { data } = await api.patch<{ medication: Medication }>(`/medications/${id}/changes/${changeId}`, input);
  return data.medication;
}

export async function deleteChange(id: string, changeId: string): Promise<Medication> {
  const { data } = await api.delete<{ medication: Medication }>(`/medications/${id}/changes/${changeId}`);
  return data.medication;
}

export async function createSymptom(input: SymptomInput): Promise<Symptom> {
  const { data } = await api.post<{ symptom: Symptom }>('/symptoms', input);
  return data.symptom;
}

export async function updateSymptom(id: string, input: SymptomUpdate): Promise<Symptom> {
  const { data } = await api.patch<{ symptom: Symptom }>(`/symptoms/${id}`, input);
  return data.symptom;
}

export async function deleteSymptom(id: string): Promise<void> {
  await api.delete(`/symptoms/${id}`);
}

export async function saveSymptomCheck(id: string, date: string, intensity: number): Promise<Symptom> {
  const { data } = await api.put<{ symptom: Symptom }>(`/symptoms/${id}/checks/${date}`, { intensity });
  return data.symptom;
}

export async function deleteSymptomCheck(id: string, date: string): Promise<Symptom> {
  const { data } = await api.delete<{ symptom: Symptom }>(`/symptoms/${id}/checks/${date}`);
  return data.symptom;
}

// Na profissional: só leitura, com a caixa "Remédios e o que sinto" liberada.
export async function fetchPatientMedications(patientId: string): Promise<MedicationsData> {
  const { data } = await api.get<MedicationsData>(`/therapist/patients/${patientId}/medications`);
  return data;
}
