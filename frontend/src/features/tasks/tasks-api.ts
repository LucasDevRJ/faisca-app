import { api } from '../../lib/api';
import type { ProfessionalKind } from '../links/links-api';
export type TaskResponseStatus = 'RESPONDIDA' | 'NAO_CONSEGUI' | 'NAO_FAZ_SENTIDO';
export type Task = {
  id: string; title: string | null; description: string; agreedLinkId: string | null;
  agreedWith: { name: string; kind: ProfessionalKind } | null;
  responseStatus: TaskResponseStatus | null; responseText: string | null;
  respondedAt: string | null; responseDeadline: string | null; responseEditable: boolean;
  createdAt: string; updatedAt: string;
};
export type TaskInput = { title: string | null; description: string; agreedLinkId: string | null };
export type TaskResponseInput = { responseStatus: TaskResponseStatus; responseText: string | null };
export async function fetchTasks(): Promise<Task[]> { return (await api.get<{ tasks: Task[] }>('/tasks')).data.tasks; }
export async function createTask(input: TaskInput): Promise<Task> { return (await api.post<{ task: Task }>('/tasks', input)).data.task; }
export async function updateTask(id: string, input: TaskInput): Promise<Task> { return (await api.patch<{ task: Task }>(`/tasks/${id}`, input)).data.task; }
export async function deleteTask(id: string): Promise<void> { await api.delete(`/tasks/${id}`); }
export async function respondTask(id: string, input: TaskResponseInput): Promise<Task> { return (await api.put<{ task: Task }>(`/tasks/${id}/response`, input)).data.task; }
