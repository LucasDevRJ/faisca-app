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

// intensityAfter: "como me sinto agora", depois da explicação alternativa (DEC-054).
export type EmotionEntry = { emotion: Emotion; intensity: number; intensityAfter: number | null; otherLabel: string | null };

// A consulta que fecha o prazo da explicação alternativa: dia e hora em São Paulo.
export type AlternativeDeadline = { date: string; time: string | null };

export type ThoughtRecord = {
  id: string;
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: EmotionEntry[];
  behavior: string;
  consequence: string;
  // Explicação alternativa (DEC-054): opcional; a data diz quando entrou.
  alternativeExplanation: string | null;
  alternativeAddedAt: string | null;
  // A API diz se ainda dá para editar ou excluir (só no dia em que foi registrado).
  editable: boolean;
  // Prazo para adicionar a alternativa depois do dia (null sem consulta agendada) e se ainda dá.
  alternativeDeadline: AlternativeDeadline | null;
  canAddAlternative: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ThoughtRecordInput = {
  situationDate: string;
  situation: string;
  automaticThought: string;
  beliefLevel: number;
  emotions: { emotion: Emotion; intensity: number; intensityAfter?: number; otherLabel?: string }[];
  behavior: string;
  consequence: string;
  // Na edição, null apaga a alternativa (e a reavaliação junto).
  alternativeExplanation?: string | null;
};

export type AddAlternativeInput = {
  alternativeExplanation: string;
  // "Como me sinto agora": todas as emoções do registro, ou nenhuma.
  emotionsAfter?: { emotion: Emotion; intensityAfter: number }[];
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

// Explicação alternativa depois do dia do registro: uma vez só, até a hora da próxima consulta (DEC-054).
export async function addAlternative(id: string, input: AddAlternativeInput): Promise<ThoughtRecord> {
  const { data } = await api.post<{ thoughtRecord: ThoughtRecord }>(`/thought-records/${id}/alternative`, input);
  return data.thoughtRecord;
}

export async function deleteThoughtRecord(id: string): Promise<void> {
  await api.delete(`/thought-records/${id}`);
}
