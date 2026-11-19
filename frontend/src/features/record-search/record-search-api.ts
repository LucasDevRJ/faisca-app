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
  excerpt: string;
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
