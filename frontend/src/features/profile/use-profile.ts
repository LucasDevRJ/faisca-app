import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { SessionUser } from '../auth/auth-api';
import { SESSION_QUERY_KEY, useSession } from '../auth/use-session';
import { applyAccessibility, DEFAULT_ACCESSIBILITY, type AccessibilitySettings } from './accessibility';
import { applyPalette } from './palettes';
import { deleteAvatar, fetchProfile, updateProfile, uploadAvatar, type Profile } from './profile-api';

export const PROFILE_KEY = ['profile'] as const;

export function useProfile() {
  return useQuery({ queryKey: PROFILE_KEY, queryFn: fetchProfile });
}

// A resposta traz o perfil salvo; a paleta e os ajustes de acessibilidade também vão para a sessão,
// que é de onde o app os lê.
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(PROFILE_KEY, profile);
      queryClient.setQueryData<SessionUser | null>(SESSION_QUERY_KEY, (user) =>
        user
          ? {
              ...user,
              palette: profile.palette,
              accessibility: profile.accessibility ?? user.accessibility,
            }
          : user,
      );
    },
  });
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadAvatar,
    onSuccess: (profile) => queryClient.setQueryData(PROFILE_KEY, profile),
  });
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAvatar,
    onSuccess: () =>
      queryClient.setQueryData<Profile>(PROFILE_KEY, (profile) => (profile ? { ...profile, avatarVersion: null } : profile)),
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

// Ajustes de acessibilidade da conta logada (com padrão desligado quando não há sessão ou quando
// o teste não preenche o campo).
export function useAccessibility(): AccessibilitySettings {
  const { data: user } = useSession();
  return user?.accessibility ?? DEFAULT_ACCESSIBILITY;
}

// Aplica leitura confortável e menos movimento da conta assim que a sessão chega. Sem sessão,
// ficam os últimos valores do aparelho, aplicados pelo theme-init.js.
export function useAccessibilityFromSession() {
  const { data: user } = useSession();
  const accessibility = user?.accessibility;
  useEffect(() => {
    if (accessibility) applyAccessibility(accessibility);
  }, [accessibility]);
}
