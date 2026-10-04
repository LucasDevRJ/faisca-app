import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelSession,
  createExtra,
  deleteExtra,
  endSchedule,
  fetchAgenda,
  pauseAgenda,
  rescheduleSession,
  resumeAgenda,
  setSchedule,
  undoSessionChange,
  updateExtra,
  type DateRange,
  type ExtraInput,
} from './appointments-api';

const APPOINTMENTS_KEY = ['appointments'] as const;

// Sem período: de 91 dias atrás a 91 à frente (card e página de consultas). Com período: os
// selos "consulta" da semana aberta.
export function useAgenda(range?: DateRange) {
  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, range?.from ?? null, range?.to ?? null],
    queryFn: () => fetchAgenda(range),
  });
}

// Toda gravação recarrega a agenda (e, com ela, a última e a próxima consulta).
function useAgendaMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  });
}

export const useSetSchedule = () => useAgendaMutation(setSchedule);
export const useEndSchedule = () => useAgendaMutation(() => endSchedule());
export const usePauseAgenda = () => useAgendaMutation(pauseAgenda);
export const useResumeAgenda = () => useAgendaMutation(() => resumeAgenda());
export const useCancelSession = () =>
  useAgendaMutation(({ originalDate, reason }: { originalDate: string; reason: string }) =>
    cancelSession(originalDate, reason),
  );
export const useRescheduleSession = () => useAgendaMutation(rescheduleSession);
export const useUndoSessionChange = () => useAgendaMutation(undoSessionChange);
export const useCreateExtra = () => useAgendaMutation(createExtra);
export const useUpdateExtra = () =>
  useAgendaMutation(({ id, ...input }: ExtraInput & { id: string }) => updateExtra(id, input));
export const useDeleteExtra = () => useAgendaMutation(deleteExtra);
