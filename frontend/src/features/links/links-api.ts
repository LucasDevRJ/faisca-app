import { api } from '../../lib/api';

// Chamadas às rotas de vínculo (DEC-031). /link é o lado do paciente; /links, o da terapeuta.
// Quem é quem vem sempre da sessão, nunca do front.

// O tipo de quem acompanha o paciente (DEC-097).
export type ProfessionalKind = 'PSICOLOGIA' | 'PSIQUIATRIA';

// As áreas que o paciente libera para cada profissional (DEC-097), na ordem das telas.
export const SHARED_AREAS = [
  'ACTIVITIES',
  'THOUGHT_RECORDS',
  'TENSION_EPISODES',
  'ACTIONS',
  'ACTION_PHOTOS',
  'ABOUT_ME',
  'APPOINTMENTS',
  'PLANS',
] as const;
export type SharedArea = (typeof SHARED_AREAS)[number];

export type PatientLink = {
  id: string;
  method: 'INVITE' | 'CODE';
  createdAt: string;
  // false = o paciente ainda não viu o aviso de novo vínculo.
  seen: boolean;
  kind: ProfessionalKind;
  // O que o paciente liberou para esta profissional; vínculo novo começa vazio (DEC-097).
  sharedAreas: SharedArea[];
  // avatarVersion: quando a foto dela mudou, ou null sem foto (DEC-061). Conselho opcional.
  therapist: { name: string; email: string; avatarVersion: string | null; councilNumber: string | null };
};

export type LinkStatus = {
  // Todos os vínculos ativos, a psicóloga primeiro (DEC-097).
  links: PatientLink[];
  // O primeiro da lista (telas de antes da DEC-097).
  link: PatientLink | null;
  invite: { id: string; therapistEmail: string; createdAt: string } | null;
  // O código em si não volta: o banco só guarda o hash. Aparece só na resposta de quando é gerado.
  code: { expiresAt: string } | null;
};

export type GeneratedCode = { code: string; expiresAt: string };

export type LinkedPatient = { id: string; name: string; email: string; linkedAt: string; avatarVersion: string | null };
// Na lista de pacientes: quantos registros a terapeuta ainda tem para ler (DEC-057).
export type ListedPatient = LinkedPatient & { unreadCount: number };

export async function fetchLinkStatus(): Promise<LinkStatus> {
  const { data } = await api.get<LinkStatus>('/link');
  return data;
}

export async function generateLinkCode(): Promise<GeneratedCode> {
  const { data } = await api.post<GeneratedCode>('/link/code');
  return data;
}

export async function createInvite(email: string): Promise<void> {
  await api.post('/link/invite', { email });
}

export async function cancelInvite(): Promise<void> {
  await api.delete('/link/invite');
}

export async function revokeLink(linkId: string): Promise<void> {
  await api.post('/link/revoke', { linkId });
}

// O que esta profissional pode ver (DEC-097). Vale na hora.
export async function setSharedAreas(linkId: string, areas: SharedArea[]): Promise<PatientLink> {
  const { data } = await api.put<{ link: PatientLink }>(`/link/${linkId}/areas`, { areas });
  return data.link;
}

export async function markLinkSeen(): Promise<void> {
  await api.post('/link/seen');
}

export async function redeemLinkCode(code: string): Promise<LinkedPatient> {
  const { data } = await api.post<{ patient: LinkedPatient }>('/links/redeem-code', { code });
  return data.patient;
}

export async function acceptInvite(token: string): Promise<LinkedPatient> {
  const { data } = await api.post<{ patient: LinkedPatient }>('/links/accept-invite', { token });
  return data.patient;
}

export async function fetchLinkedPatients(): Promise<ListedPatient[]> {
  const { data } = await api.get<{ patients: ListedPatient[] }>('/links/patients');
  return data.patients;
}
