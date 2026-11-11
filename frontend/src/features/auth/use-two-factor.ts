import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  sendActionEmailCode,
  startTwoFactorSetup,
  verifyTwoFactorLogin,
} from './two-factor-api';
import { SESSION_ENDED_KEY, SESSION_QUERY_KEY } from './use-session';

export const TWO_FACTOR_QUERY_KEY = ['two-factor'] as const;

export function useTwoFactorStatus() {
  return useQuery({ queryKey: TWO_FACTOR_QUERY_KEY, queryFn: fetchTwoFactorStatus });
}

// Toda gravação recarrega o estado, mesmo depois de erro: um código de recuperação pode ter sido
// gasto, ou outro aparelho pode ter mudado alguma coisa. gcTime 0: a senha, o segredo do app e os
// códigos de recuperação não ficam guardados na memória do app depois que a janela fecha (achado do
// revisor-seguranca).
function useTwoFactorMutation<TInput, TOutput>(mutationFn: (input: TInput) => Promise<TOutput>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    gcTime: 0,
    onSettled: () => queryClient.invalidateQueries({ queryKey: TWO_FACTOR_QUERY_KEY }),
  });
}

export function useStartTwoFactorSetup() {
  return useTwoFactorMutation(startTwoFactorSetup);
}

export function useConfirmTwoFactorSetup() {
  return useTwoFactorMutation(confirmTwoFactorSetup);
}

export function useRegenerateRecoveryCodes() {
  return useTwoFactorMutation(regenerateRecoveryCodes);
}

export function useDisableTwoFactor() {
  return useTwoFactorMutation(disableTwoFactor);
}

export function useSendActionEmailCode() {
  return useMutation({ mutationFn: sendActionEmailCode, gcTime: 0 });
}

// Código certo no login: a sessão abre, como no login sem 2FA.
export function useVerifyTwoFactorLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: verifyTwoFactorLogin,
    gcTime: 0,
    onSuccess: (user) => {
      queryClient.removeQueries({ queryKey: SESSION_ENDED_KEY, exact: true });
      queryClient.setQueryData(SESSION_QUERY_KEY, user);
    },
  });
}
