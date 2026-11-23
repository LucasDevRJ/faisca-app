import { api } from '../../lib/api';

export type LinkedRecordType = 'ACTIVITY' | 'THOUGHT_RECORD' | 'TENSION_EPISODE' | 'ACTION' | 'PLAN' | 'PLAN_ENTRY' | 'TASK' | 'SLEEP_MOOD' | 'MEDICATION';
export type RecordSummary = { type: LinkedRecordType; id: string; date: string; title: string; measure?: string; observation?: string; parentId?: string };
export type RecordLink = { id: string; kind: 'RELATED' | 'REPETITION'; source: RecordSummary; target: RecordSummary };
export async function fetchRecordLinks(type: LinkedRecordType, id: string, patientId?: string) {
  const path = patientId ? `/therapist/patients/${patientId}/record-links` : '/record-links';
  const { data } = await api.get<{ links: RecordLink[] }>(path, { params: { recordType: type, recordId: id } });
  return data.links;
}
// Sem registro de origem (mensagens, DEC-128), o período é obrigatório.
export async function fetchRecordLinkCandidates(type: LinkedRecordType | undefined, id: string | undefined, from?: string, to?: string) {
  const { data } = await api.get<{ records: RecordSummary[] }>('/record-links/candidates', { params: { recordType: type, recordId: id, from, to } });
  return data.records;
}
export async function createRecordLink(sourceType: LinkedRecordType, sourceId: string, target: RecordSummary) {
  const { data } = await api.post<{ link: RecordLink }>('/record-links', { sourceType, sourceId, targetType: target.type, targetId: target.id });
  return data.link;
}
export async function deleteRecordLink(id: string) { await api.delete(`/record-links/${id}`); }
