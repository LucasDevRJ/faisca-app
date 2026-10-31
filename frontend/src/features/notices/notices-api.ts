import { api } from '../../lib/api';
import { getApiError } from '../auth/auth-api';

// Mural de avisos da terapeuta (DEC-079, DEC-080). O backend decide quem é quem pela sessão: o front
// nunca manda id de usuário.

// Limite do texto, igual ao da API (DEC-079).
export const NOTICE_MAX = 2000;

export type Notice = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

// Do lado do paciente: o "já vi" é só dele.
export type PatientNotice = Notice & { seen: boolean };
export type PatientNotices = { notices: PatientNotice[]; unseenCount: number };

// ——— Terapeuta: os próprios avisos ———

export async function fetchOwnNotices(): Promise<Notice[]> {
  const { data } = await api.get<{ notices: Notice[] }>('/therapist/notices');
  return data.notices;
}

export async function createNotice(body: string): Promise<Notice> {
  const { data } = await api.post<{ notice: Notice }>('/therapist/notices', { body });
  return data.notice;
}

export async function updateNotice(id: string, body: string): Promise<Notice> {
  const { data } = await api.patch<{ notice: Notice }>(`/therapist/notices/${id}`, { body });
  return data.notice;
}

export async function deleteNotice(id: string): Promise<void> {
  await api.delete(`/therapist/notices/${id}`);
}

// ——— Paciente: os avisos de quem acompanha ———

export async function fetchPatientNotices(): Promise<PatientNotices> {
  const { data } = await api.get<PatientNotices>('/notices');
  return data;
}

export async function markNoticesSeen(ids: string[]): Promise<PatientNotices> {
  const { data } = await api.put<PatientNotices>('/notices/seen', { ids });
  return data;
}

// Editado depois de publicado? A API guarda o updatedAt; um segundo de folga cobre a gravação.
export function wasEdited(notice: Notice): boolean {
  return new Date(notice.updatedAt).getTime() - new Date(notice.createdAt).getTime() > 1000;
}

// Mesma validação da API (DEC-079): texto de 1 a 2000 caracteres, sem contar os espaços das pontas.
export function noticeBodyError(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return 'Escreva o aviso.';
  if (trimmed.length > NOTICE_MAX) return `O aviso pode ter até ${NOTICE_MAX} caracteres.`;
  return undefined;
}

// Muitas publicações seguidas (limite por hora da API): mensagem própria, sem cara de bloqueio.
export function noticeApiMessage(error: unknown): string {
  const info = getApiError(error);
  if (info.status === 429) return 'Você publicou vários avisos seguidos. Tente de novo daqui a pouco.';
  return info.message;
}
