import { api } from '../../lib/api';
import type { Palette } from './palettes';

// Perfil básico (DEC-061, DEC-063): sempre da própria conta, pela sessão.

export const FULL_NAME_MAX = 120;

export type Profile = {
  fullName: string | null;
  palette: Palette;
  // Quando a foto mudou pela última vez, ou null sem foto.
  avatarVersion: string | null;
};

export type UpdateProfileInput = { fullName?: string | null; palette?: Palette };

export async function fetchProfile(): Promise<Profile> {
  const { data } = await api.get<{ profile: Profile }>('/profile');
  return data.profile;
}

// Muda só os campos enviados.
export async function updateProfile(input: UpdateProfileInput): Promise<Profile> {
  const { data } = await api.patch<{ profile: Profile }>('/profile', input);
  return data.profile;
}
