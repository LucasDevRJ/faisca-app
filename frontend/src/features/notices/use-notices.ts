import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createNotice,
  deleteNotice,
  fetchOwnNotices,
  fetchPatientNotices,
  markNoticesSeen,
  updateNotice,
} from './notices-api';

// Chaves separadas: a lista da terapeuta e a do paciente são dados diferentes, e quem tem os dois
// perfis vê as duas.
export const OWN_NOTICES_KEY = ['notices', 'own'] as const;
export const PATIENT_NOTICES_KEY = ['notices', 'patient'] as const;

// ——— Terapeuta ———

export function useOwnNotices() {
  return useQuery({ queryKey: OWN_NOTICES_KEY, queryFn: fetchOwnNotices });
}

// Toda gravação recarrega a lista, mesmo depois de erro (ex.: aviso apagado em outro aparelho).
function useOwnNoticeMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: OWN_NOTICES_KEY }),
  });
}

export const useCreateNotice = () => useOwnNoticeMutation((body: string) => createNotice(body));
export const useUpdateNotice = () =>
  useOwnNoticeMutation(({ id, body }: { id: string; body: string }) => updateNotice(id, body));
export const useDeleteNotice = () => useOwnNoticeMutation((id: string) => deleteNotice(id));

// ——— Paciente ———

export function usePatientNotices() {
  return useQuery({ queryKey: PATIENT_NOTICES_KEY, queryFn: fetchPatientNotices });
}

// O "já vi" não atualiza a lista em memória de propósito (DEC-080): o selo "Novo" continua durante
// a visita, para a pessoa saber qual aviso é o novo, e some na próxima vez que a lista carregar.
export function useMarkNoticesSeen() {
  return useMutation({ mutationFn: (ids: string[]) => markNoticesSeen(ids) });
}
