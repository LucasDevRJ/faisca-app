import { isAxiosError } from 'axios';
import { api } from '../../lib/api';

// Chamadas às rotas /auth da API (DEC-025). A sessão fica no cookie httpOnly:
// o front nunca vê nem guarda o token.

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  profiles: { patient: boolean; therapist: boolean };
};

export type SignupInput = {
  name: string;
  email: string;
  password: string;
  profiles: { patient: boolean; therapist: boolean };
};

export type ApiErrorInfo = {
  status: number | null;
  code: string;
  message: string;
  // Erros de validação por campo (VALIDATION_ERROR), no formato { email: 'mensagem' }.
  fields: Record<string, string>;
};

const GENERIC_MESSAGE = 'Não conseguimos falar com o Faísca agora. Confira sua conexão e tente de novo.';

// Traduz qualquer erro de chamada à API para um formato único, com texto pronto para a tela.
export function getApiError(error: unknown): ApiErrorInfo {
  if (isAxiosError(error) && error.response) {
    const body = error.response.data as
      | { error?: { code?: string; message?: string; issues?: { path: string; message: string }[] } }
      | undefined;
    const fields: Record<string, string> = {};
    for (const issue of body?.error?.issues ?? []) {
      fields[issue.path] ??= issue.message;
    }
    return {
      status: error.response.status,
      code: body?.error?.code ?? 'UNKNOWN',
      message: body?.error?.message ?? GENERIC_MESSAGE,
      fields,
    };
  }
  return { status: null, code: 'NETWORK_ERROR', message: GENERIC_MESSAGE, fields: {} };
}

// 401 aqui não é erro: só quer dizer que ninguém entrou ainda.
export async function fetchSession(): Promise<SessionUser | null> {
  try {
    const { data } = await api.get<{ user: SessionUser }>('/auth/me');
    return data.user;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) return null;
    throw error;
  }
}

export async function login(input: { email: string; password: string }): Promise<SessionUser> {
  const { data } = await api.post<{ user: SessionUser }>('/auth/login', input);
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function signup(input: SignupInput): Promise<void> {
  await api.post('/auth/signup', input);
}

export async function confirmEmail(token: string): Promise<void> {
  await api.post('/auth/confirm-email', { token });
}

export async function resendConfirmation(email: string): Promise<void> {
  await api.post('/auth/resend-confirmation', { email });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/auth/forgot-password', { email });
}

export async function resetPassword(input: { token: string; password: string }): Promise<void> {
  await api.post('/auth/reset-password', input);
}
