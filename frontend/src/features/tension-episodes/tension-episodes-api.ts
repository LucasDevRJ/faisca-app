import { api } from '../../lib/api';

// Chamadas às rotas /tension-episodes (DEC-042). O backend decide o dono pela sessão:
// o front nunca manda id de usuário.

export type TensionEpisode = {
  id: string;
  episodeDate: string;
  // 'HH:MM' no relógio de São Paulo, ou null quando a pessoa não informou.
  episodeTime: string | null;
  situation: string;
  tensionLevel: number;
  vocalizeUrge: number;
  behavior: string;
  consequence: string;
  // A API diz se ainda dá para editar ou excluir (só no dia em que foi registrado).
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TensionEpisodeInput = {
  episodeDate: string;
  episodeTime: string | null;
  situation: string;
  tensionLevel: number;
  vocalizeUrge: number;
  behavior: string;
  consequence: string;
};

export async function fetchTensionEpisodes(from: string, to: string): Promise<TensionEpisode[]> {
  const { data } = await api.get<{ tensionEpisodes: TensionEpisode[] }>('/tension-episodes', { params: { from, to } });
  return data.tensionEpisodes;
}

export async function fetchTensionEpisode(id: string): Promise<TensionEpisode> {
  const { data } = await api.get<{ tensionEpisode: TensionEpisode }>(`/tension-episodes/${id}`);
  return data.tensionEpisode;
}

export async function createTensionEpisode(input: TensionEpisodeInput): Promise<TensionEpisode> {
  const { data } = await api.post<{ tensionEpisode: TensionEpisode }>('/tension-episodes', input);
  return data.tensionEpisode;
}

// A edição manda o formulário inteiro; episodeTime: null apaga a hora.
export async function updateTensionEpisode(id: string, input: TensionEpisodeInput): Promise<TensionEpisode> {
  const { data } = await api.patch<{ tensionEpisode: TensionEpisode }>(`/tension-episodes/${id}`, input);
  return data.tensionEpisode;
}

export async function deleteTensionEpisode(id: string): Promise<void> {
  await api.delete(`/tension-episodes/${id}`);
}
