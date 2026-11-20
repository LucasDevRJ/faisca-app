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
  setReadReceiptsRequested,
  setReadReceiptsShared,
  setSharedAreas,
  type SharedArea,
} from './links-api';

const LINK_KEY = ['link'] as const;
export const READ_RECEIPTS_KEY = ['read-receipts'] as const;
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

// Desfazer o vínculo e mudar as áreas também mudam as leituras que o paciente vê (DEC-118): sem
// recarregar, um "Lido" de uma área fechada ficaria na tela até a próxima busca.
function useLinkAndReceiptsMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LINK_KEY });
      await queryClient.invalidateQueries({ queryKey: READ_RECEIPTS_KEY });
    },
  });
}

export function useRevokeLink() {
  return useLinkAndReceiptsMutation((linkId: string) => revokeLink(linkId));
}

export function useSetSharedAreas() {
  return useLinkAndReceiptsMutation(({ linkId, areas }: { linkId: string; areas: SharedArea[] }) =>
    setSharedAreas(linkId, areas),
  );
}

// Ligar ou desligar o pedido muda também o que aparece nos cartões (DEC-118).
export function useSetReadReceiptsRequested() {
  return useLinkAndReceiptsMutation(({ linkId, requested }: { linkId: string; requested: boolean }) =>
    setReadReceiptsRequested(linkId, requested),
  );
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

export function useSetReadReceiptsShared(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shared: boolean) => setReadReceiptsShared(patientId, shared),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PATIENTS_KEY }),
  });
}
