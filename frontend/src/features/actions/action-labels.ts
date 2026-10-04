import { daysBetween } from '../activities/week';
import type { Action, ActionCategory } from './actions-api';

// Textos da Ação (SPEC, "Ação"; DEC-052). Tom acolhedor, sem cobrança.

export const CATEGORIES: ActionCategory[] = ['PRAZER', 'CONEXAO', 'REALIZACAO'];

export const CATEGORY_TEXT: Record<
  ActionCategory,
  { label: string; description: string; examples: string; placeholder: string }
> = {
  PRAZER: {
    label: 'Prazer',
    description: 'Algo que você gosta de fazer só por fazer.',
    examples: 'Ouvir música, cozinhar algo gostoso, ver um filme.',
    placeholder: 'Ex.: ouvir um disco inteiro',
  },
  CONEXAO: {
    label: 'Conexão',
    description: 'Aproximar-se de alguém.',
    examples: 'Mandar mensagem para alguém, encontrar um amigo, ligar para a família.',
    placeholder: 'Ex.: tomar um café com uma amiga',
  },
  REALIZACAO: {
    label: 'Realização',
    description: 'Algo que dá sensação de propósito ou de dever cumprido.',
    examples: 'Organizar um canto da casa, estudar, resolver uma pendência.',
    placeholder: 'Ex.: organizar a escrivaninha',
  },
};

// As três notas, com as legendas dos extremos (sliders, frontend/CLAUDE.md).
export const SCORE_TEXT = {
  expectation: { label: 'Quanto espera gostar', short: 'Esperava', min: 'Nada', max: 'Muito' },
  pleasure: { label: 'Prazer', short: 'Prazer', min: 'Nenhum', max: 'Muito' },
  achievement: { label: 'Realização', short: 'Realização', min: 'Nenhuma', max: 'Muita' },
} as const;

// Meta do ciclo (DEC-052): uma de cada tipo; duas no ciclo de 14 dias ou mais (sessões quinzenais).
export function slotsPerCategory(range: { from: string; to: string }): number {
  return daysBetween(range.from, range.to) + 1 >= 14 ? 2 : 1;
}

// Quantas ações feitas (avaliadas) de cada tipo há no período.
export function doneByCategory(actions: Action[]): Record<ActionCategory, number> {
  const counts: Record<ActionCategory, number> = { PRAZER: 0, CONEXAO: 0, REALIZACAO: 0 };
  for (const action of actions) if (action.status === 'AVALIADA') counts[action.category] += 1;
  return counts;
}
