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
  createdAt: string;
  updatedAt: string;
};

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
