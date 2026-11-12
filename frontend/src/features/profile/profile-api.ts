import { api } from '../../lib/api';
import type { AccessibilitySettings } from './accessibility';
import type { Palette } from './palettes';

// Perfil básico e acessibilidade (DEC-061, DEC-063, DEC-076): sempre da própria conta, pela sessão.

export const FULL_NAME_MAX = 120;

export type Profile = {
  fullName: string | null;
  palette: Palette;
  // Quando a foto mudou pela última vez, ou null sem foto.
  avatarVersion: string | null;
  accessibility?: AccessibilitySettings;
};

export type UpdateProfileInput = {
  fullName?: string | null;
  palette?: Palette;
  accessibility?: Partial<AccessibilitySettings>;
};

export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get<{ profile: Profile }>('/profile');
  return data.profile;
}

// Muda só os campos enviados.
export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const { data } = await api.patch<{ profile: Profile }>('/profile', input);
  return data.profile;
}

// A foto já recortada no aparelho; a API recorta de novo, reduz e tira os metadados (DEC-061).
export async function uploadAvatar(image: Blob): Promise<Profile> {
  const { data } = await api.put<{ profile: Profile }>('/profile/avatar', image, {
    headers: { 'Content-Type': image.type },
  });
  return data.profile;
}

export async function deleteAvatar(): Promise<void> {
  await api.delete('/profile/avatar');
}

// Endereços para o <img>, que manda o cookie da sessão sozinho. A versão no fim evita mostrar uma
// foto antiga guardada pelo navegador.
export const avatarUrls = {
  own: (version: string) => `/api/profile/avatar?v=${encodeURIComponent(version)}`,
  myTherapist: (version: string) => `/api/link/therapist/avatar?v=${encodeURIComponent(version)}`,
  // A foto de cada profissional, pelo vínculo (DEC-097).
  linked: (linkId: string, version: string) => `/api/link/${linkId}/avatar?v=${encodeURIComponent(version)}`,
  patient: (patientId: string, version: string) =>
    `/api/therapist/patients/${patientId}/avatar?v=${encodeURIComponent(version)}`,
};
