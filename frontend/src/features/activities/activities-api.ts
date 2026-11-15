import { api } from '../../lib/api';

// Chamadas às rotas /activities (DEC-028). O backend decide o dono pela sessão:
// o front nunca manda id de usuário.

export type ActivityStatus = 'PLANEJADA' | 'PENDENTE' | 'CONCLUIDA' | 'NAO_REALIZADA';

export type Activity = {
  id: string;
  name: string;
  activityDate: string;
  status: ActivityStatus;
  wantBefore: number | null;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  // Fotos (DEC-103). photosOpen diz se dá para adicionar agora (aberta, ou concluída antes do prazo);
  // photosDeadline é a consulta que fecha o prazo da concluída (null aberta ou sem consulta marcada).
  photos: { id: string; createdAt: string }[];
  photosDeadline: { date: string; time: string | null } | null;
  photosOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

// Até 10 fotos por atividade, como na Ação (DEC-103).
export const MAX_ACTIVITY_PHOTOS = 10;

export type CreateActivityInput =
  | { status: 'PLANEJADA'; name: string; activityDate: string }
  | { status: 'PENDENTE'; name: string; activityDate: string; wantBefore: number }
  | {
      status: 'CONCLUIDA';
      name: string;
      activityDate: string;
      wantBefore: number;
      pleasure: number;
      achievement: number;
      observation?: string;
    };

export type UpdateActivityInput = { name?: string; activityDate?: string; wantBefore?: number };
export type CompleteActivityInput = { pleasure: number; achievement: number; observation?: string };

export const FINAL_STATUSES: readonly ActivityStatus[] = ['CONCLUIDA', 'NAO_REALIZADA'];

export function isFinal(status: ActivityStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

export async function fetchActivities(from: string, to: string): Promise<Activity[]> {
  const { data } = await api.get<{ activities: Activity[] }>('/activities', { params: { from, to } });
  return data.activities;
}

export async function createActivity(input: CreateActivityInput): Promise<Activity> {
  const { data } = await api.post<{ activity: Activity }>('/activities', input);
  return data.activity;
}

export async function updateActivity(id: string, input: UpdateActivityInput): Promise<Activity> {
  const { data } = await api.patch<{ activity: Activity }>(`/activities/${id}`, input);
  return data.activity;
}

export async function startActivity(id: string, wantBefore: number): Promise<Activity> {
  const { data } = await api.post<{ activity: Activity }>(`/activities/${id}/start`, { wantBefore });
  return data.activity;
}

export async function completeActivity(id: string, input: CompleteActivityInput): Promise<Activity> {
  const { data } = await api.post<{ activity: Activity }>(`/activities/${id}/complete`, input);
  return data.activity;
}

export async function markNotDone(id: string, observation?: string): Promise<Activity> {
  const { data } = await api.post<{ activity: Activity }>(`/activities/${id}/not-done`, { observation });
  return data.activity;
}

export async function deleteActivity(id: string): Promise<void> {
  await api.delete(`/activities/${id}`);
}

// ——— Fotos (DEC-103) ———

// A foto vai como o próprio arquivo, com o tipo dele; o backend confere pelo conteúdo.
export async function uploadActivityPhoto(activityId: string, file: File): Promise<void> {
  await api.post(`/activities/${activityId}/photos`, file, { headers: { 'Content-Type': file.type } });
}

export async function deleteActivityPhoto(activityId: string, photoId: string): Promise<void> {
  await api.delete(`/activities/${activityId}/photos/${photoId}`);
}

// Endereço da imagem para o <img>: a do paciente, ou a da profissional pelo prefixo do vínculo
// (base = '/therapist/patients/:id'). O cookie da sessão vai junto, como em toda a API.
export function activityPhotoUrl(base: string, activityId: string, photoId: string, size: 'thumb' | 'full'): string {
  return `/api${base}/activities/${activityId}/photos/${photoId}?size=${size}`;
}
