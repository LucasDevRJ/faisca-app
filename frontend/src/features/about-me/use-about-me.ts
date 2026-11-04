import { skipToken, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getApiError } from '../auth/auth-api';
import { fetchAboutMe, saveAboutMe } from './about-me-api';

export const ABOUT_ME_KEY = ['about-me'] as const;

// 403 é resposta definitiva (sem aceite do aviso): tentar de novo não adianta.
function retryUnlessForbidden(failureCount: number, error: unknown) {
  return getApiError(error).status !== 403 && failureCount < 1;
}

// enabled = false enquanto a pessoa não aceitou a versão do aviso que cita o "Sobre mim".
export function useAboutMe(enabled: boolean) {
  return useQuery({
    queryKey: ABOUT_ME_KEY,
    queryFn: enabled ? fetchAboutMe : skipToken,
    retry: retryUnlessForbidden,
  });
}

export function useSaveAboutMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveAboutMe,
    onSuccess: (aboutMe) => queryClient.setQueryData(ABOUT_ME_KEY, aboutMe),
  });
}
