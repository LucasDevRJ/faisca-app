import { api } from '../../lib/api';

export const SEARCH_TYPES = [
  'ACTIVITY', 'THOUGHT_RECORD', 'TENSION_EPISODE', 'ACTION', 'ABOUT_ME', 'PLAN_ENTRY', 'TASK', 'SLEEP_MOOD', 'MEDICATION',
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

export type RecordSearchInput = {
  term: string;
  types?: SearchType[];
  from?: string;
  to?: string;
  emotion?: string;
  minIntensity?: number;
  onlyUnread?: boolean;
  page: number;
  pageSize: number;
};

export type SearchResult = {
  id: string;
  type: SearchType;
  date: string;
  title: string;
  // Onde a palavra cai no título, para realçar ali; null quando ela não está no título.
  titleMatch?: { start: number; length: number } | null;
  // Trecho de um campo só (sem repetir o título); vazio quando a palavra só aparece no título.
  excerpt: string;
  // Nome do campo de onde veio o trecho, para o rótulo ("Resposta: …").
  excerptField?: string | null;
  matchStart: number;
  matchLength: number;
  content: Record<string, unknown>;
  unread?: boolean;
};

export type RecordSearchResponse = { results: SearchResult[]; page: number; pageSize: number; total: number; hasMore: boolean };

export async function searchPatientRecords(input: RecordSearchInput): Promise<RecordSearchResponse> {
  const { data } = await api.post<RecordSearchResponse>('/records/search', input);
  return data;
}

export async function searchTherapistPatientRecords(patientId: string, input: RecordSearchInput): Promise<RecordSearchResponse> {
  const { data } = await api.post<RecordSearchResponse>(`/therapist/patients/${patientId}/records/search`, input);
  return data;
}
