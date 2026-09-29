import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addProfile, deleteAccount, fetchSession, login, logout } from './auth-api';

export const SESSION_QUERY_KEY = ['session'] as const;

// Quem está logado. `data` é null quando não há sessão.
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    // A sessão só muda por ação da pessoa (entrar/sair); não precisa recarregar sozinha.
    staleTime: Infinity,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => queryClient.setQueryData(SESSION_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logout,
    // Apaga tudo o que estava em memória: nada da conta anterior fica para a próxima pessoa.
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });
}

// Como no logout: nada da conta apagada fica em memória.
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
    },
  });
}

// A resposta já traz a conta com os perfis novos: atualiza a sessão sem outra ida à API.
export function useAddProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addProfile,
    onSuccess: (user) => queryClient.setQueryData(SESSION_QUERY_KEY, user),
  });
}

// Valida o destino depois do login (?next=...). Só caminhos internos, para ninguém
// usar o link de login do Faísca para mandar a pessoa a outro site.
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  return next;
}
