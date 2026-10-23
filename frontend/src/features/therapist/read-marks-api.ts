import { api } from '../../lib/api';
import type { Action } from '../actions/actions-api';
import type { TensionEpisode } from '../tension-episodes/tension-episodes-api';
import type { ThoughtRecord } from '../thought-records/thought-records-api';

// Marcas de leitura da terapeuta (DEC-057, DEC-058). Só a terapeuta as vê; o paciente nunca.

// NAO_LIDO: sem marca. LIDO: marcado depois da última mudança. ATUALIZADO: lido, mas o registro
// mudou depois (edição, explicação alternativa, ação avaliada) e voltou a contar.
export type ReadStatus = 'NAO_LIDO' | 'LIDO' | 'ATUALIZADO';
export type ReadInfo = { readStatus: ReadStatus; readAt: string | null };
export type WithRead<T> = T & ReadInfo;

export type ReadType = 'THOUGHT_RECORD' | 'TENSION_EPISODE' | 'ACTION';
export type ReadItem = { type: ReadType; id: string };

// Área sem o aceite do aviso vem como null (a tela simplesmente não a mostra).
export type UnreadResponse = {
  thoughtRecords: WithRead<ThoughtRecord>[] | null;
  tensionEpisodes: WithRead<TensionEpisode>[] | null;
  actions: WithRead<Action>[] | null;
  counts: { thoughtRecords: number | null; tensionEpisodes: number | null; actions: number | null };
};

export function isPending(record: ReadInfo): boolean {
  return record.readStatus !== 'LIDO';
}

export async function fetchPatientUnread(patientId: string): Promise<UnreadResponse> {
  const { data } = await api.get<UnreadResponse>(`/therapist/patients/${patientId}/unread`);
  return data;
}

// A única escrita da terapeuta sobre os registros de um paciente (exceção da regra 1, DEC-057).
export async function markRead(patientId: string, items: ReadItem[]): Promise<{ marked: number; readAt: string }> {
  const { data } = await api.put<{ marked: number; readAt: string }>(`/therapist/read-marks/${patientId}`, { items });
  return data;
}

export async function unmarkRead(patientId: string, items: ReadItem[]): Promise<{ unmarked: number }> {
  const { data } = await api.delete<{ unmarked: number }>(`/therapist/read-marks/${patientId}`, { data: { items } });
  return data;
}
