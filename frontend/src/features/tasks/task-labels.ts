import type { TaskResponseStatus } from './tasks-api';
export const RESPONSE_LABELS: Record<TaskResponseStatus, string> = {
  RESPONDIDA: 'Resposta', NAO_CONSEGUI: 'Não consegui fazer', NAO_FAZ_SENTIDO: 'Não faz sentido para mim agora',
};
