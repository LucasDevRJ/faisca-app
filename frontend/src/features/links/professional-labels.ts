import type { ProfessionalKind, SharedArea } from './links-api';

// Textos das profissionais e das áreas que o paciente libera para cada uma (DEC-097, DEC-098).

export const KIND_LABEL: Record<ProfessionalKind, string> = {
  PSICOLOGIA: 'Psicóloga',
  PSIQUIATRIA: 'Psiquiatra',
};

export const AREA_LABEL: Record<SharedArea, string> = {
  ACTIVITIES: 'Atividades',
  THOUGHT_RECORDS: 'Pensamentos',
  TENSION_EPISODES: 'Tensão',
  ACTIONS: 'Ação',
  ACTION_PHOTOS: 'Fotos da Ação',
  ABOUT_ME: '“Sobre mim”',
  APPOINTMENTS: 'Agenda de consultas (com os motivos)',
  PLANS: 'Meus Planos',
};

// O primeiro nome, para os textos curtos ("O que Ana pode ver").
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
