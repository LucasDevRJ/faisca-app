import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAppointment, deleteAppointment, fetchAppointments, updateAppointment } from './appointments-api';

const APPOINTMENTS_KEY = ['appointments'] as const;

export function useAppointments() {
  return useQuery({ queryKey: APPOINTMENTS_KEY, queryFn: fetchAppointments });
}

// Toda gravação recarrega a lista (e, com ela, a última e a próxima consulta).
function useAppointmentMutation<TInput>(mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  });
}

export function useCreateAppointment() {
  return useAppointmentMutation((appointmentDate: string) => createAppointment(appointmentDate));
}

export function useUpdateAppointment() {
  return useAppointmentMutation(({ id, appointmentDate }: { id: string; appointmentDate: string }) =>
    updateAppointment(id, appointmentDate),
  );
}

export function useDeleteAppointment() {
  return useAppointmentMutation((id: string) => deleteAppointment(id));
}
