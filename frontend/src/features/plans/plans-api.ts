import { api } from '../../lib/api';

// Chamadas às rotas /plans e /plan-entries (DEC-094). O backend decide o dono pela sessão:
// o front nunca manda id de usuário.

export type Plan = {
  id: string;
  title: string;
  questions: string[];
  archived: boolean;
  archivedAt: string | null;
  // Com registros, o plano não pode ser apagado, só encerrado.
  hasEntries: boolean;
  // Dia do registro mais recente ('AAAA-MM-DD'), ou null sem registros.
  lastEntryDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanEntry = {
  id: string;
  planId: string;
  // O nome atual do plano, para a visão "Para ler", que junta registros de vários planos.
  planTitle: string;
  entryDate: string;
  // 'HH:MM' no relógio de São Paulo, ou null quando a pessoa não informou.
  entryTime: string | null;
  // As perguntas como estavam no registro, e as respostas na mesma ordem ('' = não respondida).
  questions: string[];
  answers: string[];
  // A API diz se ainda dá para editar ou excluir (só no dia em que foi registrado).
  editable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlanInput = { title: string; questions: string[] };
export type PlanEntryInput = { entryDate: string; entryTime: string | null; answers: string[] };

export async function fetchPlans(): Promise<Plan[]> {
  const { data } = await api.get<{ plans: Plan[] }>('/plans');
  return data.plans;
}

export async function fetchPlan(id: string): Promise<Plan> {
  const { data } = await api.get<{ plan: Plan }>(`/plans/${id}`);
  return data.plan;
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  const { data } = await api.post<{ plan: Plan }>('/plans', input);
  return data.plan;
}

// Nome e perguntas, ou archived: true/false para encerrar e reabrir.
export async function updatePlan(id: string, input: Partial<PlanInput> & { archived?: boolean }): Promise<Plan> {
  const { data } = await api.patch<{ plan: Plan }>(`/plans/${id}`, input);
  return data.plan;
}

export async function deletePlan(id: string): Promise<void> {
  await api.delete(`/plans/${id}`);
}

export async function fetchPlanEntries(planId: string, from: string, to: string): Promise<PlanEntry[]> {
  const { data } = await api.get<{ entries: PlanEntry[] }>(`/plans/${planId}/entries`, { params: { from, to } });
  return data.entries;
}

export async function fetchPlanEntry(id: string): Promise<PlanEntry> {
  const { data } = await api.get<{ entry: PlanEntry }>(`/plan-entries/${id}`);
  return data.entry;
}

export async function createPlanEntry(planId: string, input: PlanEntryInput): Promise<PlanEntry> {
  const { data } = await api.post<{ entry: PlanEntry }>(`/plans/${planId}/entries`, input);
  return data.entry;
}

export async function updatePlanEntry(id: string, input: PlanEntryInput): Promise<PlanEntry> {
  const { data } = await api.patch<{ entry: PlanEntry }>(`/plan-entries/${id}`, input);
  return data.entry;
}

export async function deletePlanEntry(id: string): Promise<void> {
  await api.delete(`/plan-entries/${id}`);
}
