import { api } from '../../lib/api';

// Chamadas às rotas de vínculo (DEC-031). /link é o lado do paciente; /links, o da terapeuta.
// Quem é quem vem sempre da sessão, nunca do front.

export type LinkStatus = {
  link: {
    id: string;
    method: 'INVITE' | 'CODE';
    createdAt: string;
    // false = o paciente ainda não viu o aviso de novo vínculo.
    seen: boolean;
    therapist: { name: string; email: string };
  } | null;
  invite: { id: string; therapistEmail: string; createdAt: string } | null;
  // O código em si não volta: o banco só guarda o hash. Aparece só na resposta de quando é gerado.
  code: { expiresAt: string } | null;
};

export type GeneratedCode = { code: string; expiresAt: string };

export type LinkedPatient = { id: string; name: string; email: string; linkedAt: string };

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

export async function revokeLink(): Promise<void> {
  await api.post('/link/revoke');
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

export async function fetchLinkedPatients(): Promise<LinkedPatient[]> {
  const { data } = await api.get<{ patients: LinkedPatient[] }>('/links/patients');
  return data.patients;
}
