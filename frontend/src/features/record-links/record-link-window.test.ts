import { describe, expect, it } from 'vitest';
import type { Cycle, CycleResponse } from '../cycle/cycle-api';
import { loadWindow, newerAnchor, periodIndexOf, windowLabel } from './record-link-window';

const TODAY = '2026-11-23';

// Agenda fictícia: consultas toda segunda, ciclos de segunda a segunda (DEC-049/109).
function cycleOf(date: string): CycleResponse {
  const day = new Date(`${date}T00:00:00Z`);
  const weekday = (day.getUTCDay() + 6) % 7;
  const from = new Date(day.getTime() - weekday * 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const shift = (base: string, days: number) => new Date(Date.parse(`${base}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const isCurrent = from <= TODAY && TODAY < to;
  const cycle: Cycle = {
    from, to, session: { date: to, time: '14:00', kind: 'RECORRENTE' }, completedSessionToday: null,
    isCurrent, nextChangeAt: null, truncated: false, previous: shift(from, -1), next: isCurrent ? null : shift(to, 1),
  };
  return { today: TODAY, cycle };
}
const withAgenda = (date: string) => Promise.resolve(cycleOf(date));
const withoutAgenda = () => Promise.resolve<CycleResponse>({ today: TODAY, cycle: null });

describe('janela do seletor de ligações (#260)', () => {
  it('começa no ciclo do registro e volta 3 ciclos', async () => {
    const window = await loadWindow(TODAY, TODAY, withAgenda);
    expect(window.mode).toBe('cycle');
    expect(window.periods.map((period) => period.from)).toEqual(['2026-11-23', '2026-11-16', '2026-11-09', '2026-11-02']);
    expect(window.hasNewer).toBe(false);
    expect(window.older).toBe('2026-11-01');
    expect(windowLabel(window, TODAY)).toBe('Ciclos de 02/11 a 30/11');
  });

  it('num registro antigo, a seta da direita leva até o ciclo de hoje, sem passar', async () => {
    const old = await loadWindow('2026-09-10', TODAY, withAgenda);
    expect(old.periods[0]!.from).toBe('2026-09-07');
    expect(old.hasNewer).toBe(true);
    const anchor = await newerAnchor(old, TODAY, withAgenda);
    const newer = await loadWindow(anchor, TODAY, withAgenda);
    expect(newer.periods[0]!.from).toBe('2026-10-05');
    const latest = await loadWindow(await newerAnchor(newer, TODAY, withAgenda), TODAY, withAgenda);
    expect(latest.periods[0]!.from).toBe('2026-11-02');
    const current = await loadWindow(await newerAnchor(latest, TODAY, withAgenda), TODAY, withAgenda);
    expect(current.periods[0]!.from).toBe('2026-11-23');
    expect(current.hasNewer).toBe(false);
  });

  it('sem agenda, usa 4 semanas de segunda a domingo', async () => {
    const window = await loadWindow('2026-11-20', TODAY, withoutAgenda);
    expect(window.mode).toBe('week');
    expect(window.periods[0]).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(window.periods[3]).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(window.hasNewer).toBe(true);
    expect(await newerAnchor(window, TODAY, withoutAgenda)).toBe('2026-11-23');
    expect(windowLabel(window, TODAY)).toBe('Semanas de 26/10 a 22/11');
  });

  it('o dia da consulta fica só no ciclo mais novo', () => {
    const periods = [{ from: '2026-11-16', to: '2026-11-23' }, { from: '2026-11-09', to: '2026-11-16' }];
    expect(periodIndexOf('2026-11-16', periods)).toBe(0);
    expect(periodIndexOf('2026-11-10', periods)).toBe(1);
    expect(periodIndexOf('2026-10-01', periods)).toBe(-1);
  });
});
