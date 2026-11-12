import type { ApiErrorInfo } from '../auth/auth-api';

// Textos e limites do Meus Planos (DEC-094, DEC-095). Os limites são os mesmos da API.

export const TITLE_MAX = 120;
export const QUESTIONS_MAX = 10;
export const QUESTION_MAX = 200;
export const ANSWER_MAX = 5000;

// O modelo combinado com a psicóloga do usuário: o que veio antes, o que sentiu, a função do
// comportamento, a expectativa, o comportamento e a consequência.
export const TEMPLATE_QUESTIONS = [
  'O que aconteceu antes?',
  'O que estava sentindo?',
  'O que estava procurando naquele momento?',
  'O que imaginei que receberia?',
  'O que fiz?',
  'Como me senti depois?',
];

// "às 21:30" ou "sem horário".
export function formatEntryTime(time: string | null): string {
  return time ? `às ${time}` : 'sem horário';
}

export function planLoadError(error: ApiErrorInfo): string {
  if (error.status === 404 || error.status === 400) return 'Não encontramos este plano.';
  if (error.status === 403) return 'Você não tem acesso a este plano.';
  return error.message;
}

export function entryLoadError(error: ApiErrorInfo): string {
  if (error.status === 404 || error.status === 400) return 'Não encontramos este registro.';
  if (error.status === 403) return 'Você não tem acesso a este registro.';
  return error.message;
}
