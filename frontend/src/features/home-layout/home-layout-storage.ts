export const titles = {
  notices: 'Avisos',
  appointments: 'Consultas',
  sleep: 'Sono e humor de hoje',
} as const;
export const destinations = { notices: '/avisos', appointments: '/consultas', sleep: '/sono-humor' };
type Card = keyof typeof titles;
const cards = Object.keys(titles) as Card[];
export type Layout = { order: Card[]; hidden: Card[]; collapseChart: boolean };
export const defaults: Layout = { order: cards, hidden: [], collapseChart: false };
export const layoutKey = (userId: string) => `faisca:home-layout:${userId}`;

function validCards(value: unknown): Card[] {
  return Array.isArray(value) ? cardsIn(value) : [];
}

function cardsIn(values: unknown[]): Card[] {
  return [...new Set(values.filter((value): value is Card => cards.some((card) => card === value)))];
}

export function readHomeLayout(userId?: string): Layout {
  if (!userId) return defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey(userId)) ?? 'null') as Partial<Layout> | null;
    if (!saved) return defaults;
    return {
      order: cardsIn([...validCards(saved.order), ...cards]),
      hidden: validCards(saved.hidden),
      collapseChart: saved.collapseChart === true,
    };
  } catch {
    return defaults;
  }
}
