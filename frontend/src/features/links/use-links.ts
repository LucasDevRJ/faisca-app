import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SESSION_QUERY_KEY } from '../auth/use-session';
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  fetchLinkedPatients,
  fetchLinkStatus,
  generateLinkCode,
  markLinkSeen,
  redeemLinkCode,
  revokeLink,
} from './links-api';

const LINK_KEY = ['link'] as const;
// Exportada para a tela do paciente recarregar a lista quando o vínculo cai (403).
export const PATIENTS_KEY = ['linked-patients'] as const;

// ——— Paciente ———

export function useLinkStatus() {
  return useQuery({ queryKey: LINK_KEY, queryFn: fetchLinkStatus });
}

// Toda gravação do paciente recarrega a situação do vínculo.
function usePatientLinkMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LINK_KEY }),
  });
}

export function useGenerateLinkCode() {
  return usePatientLinkMutation(() => generateLinkCode());
}

export function useCreateInvite() {
  return usePatientLinkMutation((email: string) => createInvite(email));
}

export function useCancelInvite() {
  return usePatientLinkMutation(() => cancelInvite());
}

export function useRevokeLink() {
  return usePatientLinkMutation(() => revokeLink());
}

export function useMarkLinkSeen() {
  return usePatientLinkMutation(() => markLinkSeen());
}

// ——— Terapeuta ———

export function useLinkedPatients() {
  return useQuery({ queryKey: PATIENTS_KEY, queryFn: fetchLinkedPatients });
}

export function useRedeemLinkCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: redeemLinkCode,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}

// Aceitar o convite pode ativar o perfil de terapeuta: recarrega também a sessão.
export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptInvite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: PATIENTS_KEY });
    },
  });
}
