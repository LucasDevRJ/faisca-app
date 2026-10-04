import { api } from '../../lib/api';

// Chamadas às rotas /actions (DEC-051). O backend decide o dono pela sessão: o front nunca manda
// id de usuário.

export type ActionCategory = 'PRAZER' | 'CONEXAO' | 'REALIZACAO';
export type ActionStatus = 'PLANEJADA' | 'AVALIADA' | 'NAO_REALIZADA';

export type Action = {
  id: string;
  actionDate: string;
  name: string;
  category: ActionCategory;
  status: ActionStatus;
  expectation: number;
  pleasure: number | null;
  achievement: number | null;
  observation: string | null;
  createdAt: string;
  updatedAt: string;
};

type Planned = { actionDate: string; name: string; category: ActionCategory; expectation: number };

// Planejar, ou registrar algo que já foi feito (já com a avaliação).
export type CreateActionInput =
  | ({ status: 'PLANEJADA' } & Planned)
  | ({ status: 'AVALIADA'; pleasure: number; achievement: number; observation?: string } & Planned);

export type UpdateActionInput = Partial<Planned>;
export type EvaluateActionInput = { pleasure: number; achievement: number; observation?: string };

export async function fetchActions(from: string, to: string): Promise<Action[]> {
  const { data } = await api.get<{ actions: Action[] }>('/actions', { params: { from, to } });
  return data.actions;
}

export async function fetchAction(id: string): Promise<Action> {
  const { data } = await api.get<{ action: Action }>(`/actions/${id}`);
  return data.action;
}

export async function createAction(input: CreateActionInput): Promise<Action> {
  const { data } = await api.post<{ action: Action }>('/actions', input);
  return data.action;
}

export async function updateAction(id: string, input: UpdateActionInput): Promise<Action> {
  const { data } = await api.patch<{ action: Action }>(`/actions/${id}`, input);
  return data.action;
}

export async function evaluateAction(id: string, input: EvaluateActionInput): Promise<Action> {
  const { data } = await api.post<{ action: Action }>(`/actions/${id}/evaluate`, input);
  return data.action;
}

export async function markActionNotDone(id: string, observation?: string): Promise<Action> {
  const { data } = await api.post<{ action: Action }>(`/actions/${id}/not-done`, { observation });
  return data.action;
}

export async function deleteAction(id: string): Promise<void> {
  await api.delete(`/actions/${id}`);
}
