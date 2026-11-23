import { addDays, formatDayMonth, startOfWeek } from '../activities/week';
import type { CycleResponse } from '../cycle/cycle-api';

// Janela do seletor de ligações (#260): 4 ciclos da consulta por vez (DEC-049/050) ou, sem agenda,
// 4 semanas de segunda a domingo. Os períodos vêm do mais recente para o mais antigo.
export const WINDOW_SIZE = 4;

export type WindowPeriod = { from: string; to: string };
export type LinkWindow = {
  mode: 'cycle' | 'week';
  periods: WindowPeriod[];
  // Dia que abre a janela anterior (mais antiga); null quando não há mais ciclos para trás.
  older: string | null;
  // Há período mais novo que o da janela, até o ciclo ou a semana de hoje.
  hasNewer: boolean;
  // Só no modo ciclo: um dia do ciclo seguinte ao mais novo da janela.
  newerStart: string | null;
};

type FetchCycle = (date: string) => Promise<CycleResponse>;

function weekWindow(anchor: string, today: string): LinkWindow {
  const monday = startOfWeek(anchor);
  const periods = Array.from({ length: WINDOW_SIZE }, (_, index) => {
    const from = addDays(monday, -7 * index);
    return { from, to: addDays(from, 6) };
  });
  return { mode: 'week', periods, older: addDays(monday, -7 * WINDOW_SIZE), hasNewer: monday < startOfWeek(today), newerStart: null };
}

// A janela termina no ciclo (ou na semana) do dia âncora e volta 3 períodos.
export async function loadWindow(anchor: string, today: string, fetchCycle: FetchCycle): Promise<LinkWindow> {
  const first = await fetchCycle(anchor);
  if (!first.cycle) return weekWindow(anchor, today);
  const cycles = [first.cycle];
  while (cycles.length < WINDOW_SIZE && cycles[cycles.length - 1]!.previous) {
    const response = await fetchCycle(cycles[cycles.length - 1]!.previous!);
    if (!response.cycle) break;
    cycles.push(response.cycle);
  }
  const newest = cycles[0]!;
  return {
    mode: 'cycle',
    periods: cycles.map(({ from, to }) => ({ from, to })),
    older: cycles[cycles.length - 1]!.previous,
    hasNewer: !newest.isCurrent && newest.next !== null,
    newerStart: newest.isCurrent ? null : newest.next,
  };
}

// Âncora da janela seguinte (mais nova): anda até 4 períodos para frente, sem passar de hoje.
export async function newerAnchor(window: LinkWindow, today: string, fetchCycle: FetchCycle): Promise<string> {
  if (window.mode === 'week') {
    const ahead = addDays(window.periods[0]!.from, 7 * WINDOW_SIZE);
    const current = startOfWeek(today);
    return ahead > current ? current : ahead;
  }
  let anchor = window.periods[0]!.to;
  let next = window.newerStart;
  for (let step = 0; step < WINDOW_SIZE && next; step += 1) {
    const response = await fetchCycle(next);
    if (!response.cycle) break;
    anchor = next;
    if (response.cycle.isCurrent) break;
    next = response.cycle.next;
  }
  return anchor;
}

// Cada registro fica no primeiro período (o mais novo) que contém o dia: o dia da sessão está em
// dois ciclos (DEC-109) e aparece só uma vez.
export function periodIndexOf(date: string, periods: WindowPeriod[]): number {
  return periods.findIndex((period) => period.from <= date && date <= period.to);
}

// "12/10" no ano corrente; com o ano, em outro ano (DEC-120).
function shortDate(date: string, today: string): string {
  return formatDayMonth(date, { today });
}

export function windowLabel(window: LinkWindow, today: string): string {
  const newest = window.periods[0]!;
  const oldest = window.periods[window.periods.length - 1]!;
  const noun = window.mode === 'cycle' ? 'Ciclos' : 'Semanas';
  return `${noun} de ${shortDate(oldest.from, today)} a ${shortDate(newest.to, today)}`;
}

export function periodLabel(mode: LinkWindow['mode'], period: WindowPeriod, today: string): string {
  return `${mode === 'cycle' ? 'Ciclo' : 'Semana'} de ${shortDate(period.from, today)} a ${shortDate(period.to, today)}`;
}
