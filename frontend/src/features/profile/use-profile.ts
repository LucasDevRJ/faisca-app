import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { SessionUser } from '../auth/auth-api';
import { SESSION_QUERY_KEY, useSession } from '../auth/use-session';
import { applyPalette } from './palettes';
import { fetchProfile, updateProfile } from './profile-api';

export const PROFILE_KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile });
}

// A resposta traz o perfil salvo; a paleta também vai para a sessão, que é de onde o app a lê.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      queryClient.setQueryData<SessionUser | null>(SESSION_QUERY_KEY, (user) =>
        user ? { ...user, palette: profile.palette } : user,
      );
    },
  });
}

// Aplica a paleta da conta assim que a sessão chega (e quando ela muda). Sem sessão, fica a
// última do aparelho, aplicada pelo theme-init.js.
export function usePaletteFromSession() {
  const { data: user } = useSession();
  const palette = user?.palette;
  useEffect(() => {
    if (palette) applyPalette(palette);
  }, [palette]);
}
