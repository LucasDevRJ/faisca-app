import { describe, expect, it } from 'vitest';
import { daysInRange, isInRange } from './period';

describe('daysInRange e isInRange', () => {
  it('lista os dias em ordem, com as duas pontas, atravessando o mês', () => {
    expect(daysInRange({ from: '2026-09-29', to: '2026-10-02' })).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('as pontas contam como dentro', () => {
    const range = { from: '2026-09-17', to: '2026-09-23' };
    expect(isInRange('2026-09-17', range)).toBe(true);
    expect(isInRange('2026-09-23', range)).toBe(true);
    expect(isInRange('2026-09-24', range)).toBe(false);
  });
});
