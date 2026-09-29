import { describe, expect, it } from 'vitest';
import { daysInRange, isInRange, sinceLastAppointment } from './period';

describe('sinceLastAppointment', () => {
  it('vai do dia da última consulta até hoje', () => {
    expect(sinceLastAppointment('2026-09-10', '2026-09-24')).toEqual({
      from: '2026-09-10',
      to: '2026-09-24',
      truncated: false,
    });
  });

  it('exatamente 92 dias cabem inteiros', () => {
    expect(sinceLastAppointment('2026-06-25', '2026-09-24')).toEqual({
      from: '2026-06-25',
      to: '2026-09-24',
      truncated: false,
    });
  });

  it('com mais de 92 dias, fica com os 92 mais recentes e avisa', () => {
    expect(sinceLastAppointment('2026-06-24', '2026-09-24')).toEqual({
      from: '2026-06-25',
      to: '2026-09-24',
      truncated: true,
    });
  });
});

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
