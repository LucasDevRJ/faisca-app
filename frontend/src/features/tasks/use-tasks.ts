import { skipToken, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import { createTask, updateTask, deleteTask, respondTask, fetchTasks, type TaskInput, type TaskResponseInput } from './tasks-api';
export const TASKS_KEY = ['tasks'] as const;
export function useTasks(enabled: boolean) {
  return useQuery({ queryKey: TASKS_KEY, queryFn: enabled ? fetchTasks : skipToken,
    retry: (count, error) => getApiError(error).status !== 403 && count < 1 });
}
function useTaskMutation<I, O>(mutationFn: (input: I) => Promise<O>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => client.invalidateQueries({ queryKey: TASKS_KEY }) });
}
export const useCreateTask = () => useTaskMutation(createTask);
export const useUpdateTask = () => useTaskMutation(({ id, input }: { id: string; input: TaskInput }) => updateTask(id, input));
export const useDeleteTask = () => useTaskMutation(deleteTask);
export const useRespondTask = () => useTaskMutation(({ id, input }: { id: string; input: TaskResponseInput }) => respondTask(id, input));
