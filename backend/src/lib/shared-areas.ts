import type { SharedArea } from '../generated/prisma/client.js';

// As áreas que o paciente libera para cada profissional (DEC-097), na ordem das telas. As fotos das
// atividades (DEC-103) vêm logo depois das atividades, como as da Ação depois da Ação.
export const SHARED_AREAS = [
  'ACTIVITIES',
  'ACTIVITY_PHOTOS',
  'THOUGHT_RECORDS',
  'TENSION_EPISODES',
  'ACTIONS',
  'ACTION_PHOTOS',
  'ABOUT_ME',
  'APPOINTMENTS',
  'PLANS',
] as const satisfies readonly SharedArea[];

// Campos que vêm de outra área e não podem vazar por uma área liberada (achados do revisor-regras):
// os prazos são calculados pela agenda (a data e a hora da próxima consulta), e as fotos da Ação
// têm caixa própria. Só no contexto da profissional; o paciente sempre vê tudo.

export function thoughtForProfessional<T extends { alternativeDeadline: unknown; canAddAlternative: boolean }>(
  record: T,
  sharedAreas: SharedArea[],
): T {
  if (sharedAreas.includes('APPOINTMENTS')) return record;
  return { ...record, alternativeDeadline: null, canAddAlternative: false };
}

export function actionForProfessional<
  T extends { photos: unknown[]; photosDeadline: unknown; photosOpen: boolean },
>(action: T, sharedAreas: SharedArea[]): T {
  return {
    ...action,
    ...(!sharedAreas.includes('APPOINTMENTS') && { photosDeadline: null, photosOpen: false }),
    ...(!sharedAreas.includes('ACTION_PHOTOS') && { photos: [] }),
  };
}

// Fotos das atividades (DEC-103): têm caixa própria, como as da Ação, e o prazo delas vem da agenda.
export function activityForProfessional<
  T extends { photos: unknown[]; photosDeadline: unknown; photosOpen: boolean },
>(activity: T, sharedAreas: SharedArea[]): T {
  return {
    ...activity,
    ...(!sharedAreas.includes('APPOINTMENTS') && { photosDeadline: null, photosOpen: false }),
    ...(!sharedAreas.includes('ACTIVITY_PHOTOS') && { photos: [] }),
  };
}
