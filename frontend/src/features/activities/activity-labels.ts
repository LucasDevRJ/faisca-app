import type { ActivityStatus } from './activities-api';

// Textos da interface para os estados e as notas. Tom acolhedor, sem culpa (frontend/CLAUDE.md).

export const STATUS_LABEL: Record<ActivityStatus, string> = {
  PLANEJADA: 'Planejada',
  PENDENTE: 'Vontade registrada',
  CONCLUIDA: 'Feita',
  NAO_REALIZADA: 'Não aconteceu',
};

export const SCORE_TEXT = {
  wantBefore: { label: 'Vontade antes', min: 'Nenhuma', max: 'Muita' },
  pleasure: { label: 'Prazer', min: 'Nenhum', max: 'Muito' },
  achievement: { label: 'Realização', min: 'Nenhuma', max: 'Muita' },
} as const;

export const NAME_MAX = 100;
export const OBSERVATION_MAX = 1000;
