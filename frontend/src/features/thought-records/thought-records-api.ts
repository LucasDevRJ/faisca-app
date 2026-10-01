import { api } from '../../lib/api';

// Chamadas às rotas /thought-records (DEC-039). O backend decide o dono pela sessão:
// o front nunca manda id de usuário.

export type Emotion =
  | 'TRISTEZA'
  | 'ANSIEDADE'
  | 'MEDO'
  | 'RAIVA'
  | 'CULPA'
  | 'VERGONHA'
  | 'FRUSTRACAO'
  | 'SOLIDAO'
  | 'ALEGRIA'
  | 'ALIVIO'
  | 'OUTRA';

export type EmotionEntry = { emotion: Emotion; intensity: number; otherLabel: string | null };

export type ThoughtRecord = {
  id: string;
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: EmotionEntry[];
  behavior: string;
  consequence: string;
  // A API diz se ainda dá para editar ou excluir (só no dia em que foi registrado).
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ThoughtRecordInput = {
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: { emotion: Emotion; intensity: number; otherLabel?: string }[];
  behavior: string;
  consequence: string;
};

export async function fetchThoughtRecords(from: string, to: string): Promise<ThoughtRecord[]> {
  const { data } = await api.get<{ thoughtRecords: ThoughtRecord[] }>('/thought-records', { params: { from, to } });
  return data.thoughtRecords;
}

export async function fetchThoughtRecord(id: string): Promise<ThoughtRecord> {
  const { data } = await api.get<{ thoughtRecord: ThoughtRecord }>(`/thought-records/${id}`);
  return data.thoughtRecord;
}

export async function createThoughtRecord(input: ThoughtRecordInput): Promise<ThoughtRecord> {
  const { data } = await api.post<{ thoughtRecord: ThoughtRecord }>('/thought-records', input);
  return data.thoughtRecord;
}

// A edição manda o formulário inteiro: a lista de emoções substitui a anterior (DEC-039).
export async function updateThoughtRecord(id: string, input: ThoughtRecordInput): Promise<ThoughtRecord> {
  const { data } = await api.patch<{ thoughtRecord: ThoughtRecord }>(`/thought-records/${id}`, input);
  return data.thoughtRecord;
}

export async function deleteThoughtRecord(id: string): Promise<void> {
  await api.delete(`/thought-records/${id}`);
}
