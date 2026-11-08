import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchReminders,
  pauseReminders,
  resumeReminders,
  updateReminders,
  type RemindersResponse,
} from './reminders-api';

export const REMINDERS_QUERY_KEY = ['reminders'] as const;

export function useReminders(enabled = true) {
  return useQuery({
    queryKey: REMINDERS_QUERY_KEY,
    queryFn: fetchReminders,
    enabled,
  });
}

function useRemindersMutation<Variables>(mutationFn: (variables: Variables) => Promise<RemindersResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(REMINDERS_QUERY_KEY, data);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY });
    },
  });
}

export function useUpdateReminders() {
  return useRemindersMutation(updateReminders);
}

export function usePauseReminders() {
  return useRemindersMutation(pauseReminders);
}

export function useResumeReminders() {
  return useRemindersMutation(resumeReminders);
}
