import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDayHeading,
  formatWeekRange,
  isValidDateOnly,
  startOfWeek,
  todayInAppZone,
  weekDays,
} from './week';

describe('week', () => {
  it('hoje é o dia de São Paulo, não o de UTC', () => {
    expect(todayInAppZone(new Date('2026-03-10T01:30:00Z'))).toBe('2026-03-09');
  });

  it('a semana começa na segunda', () => {
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21'); // segunda
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21'); // domingo
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28'); // quinta
  });

  it('lista os sete dias atravessando o mês', () => {
    expect(weekDays('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('soma dias atravessando o ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('valida datas AAAA-MM-DD', () => {
    expect(isValidDateOnly('2026-09-21')).toBe(true);
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(isValidDateOnly('21/09/2026')).toBe(false);
    expect(isValidDateOnly(null)).toBe(false);
  });

  it('formata o intervalo da semana', () => {
    expect(formatWeekRange('2026-09-21')).toBe('21 a 27 de set.');
    expect(formatWeekRange('2026-09-28')).toBe('28 de set. a 4 de out.');
  });

  it('formata o título do dia', () => {
    expect(formatDayHeading('2026-09-21')).toBe('segunda-feira, 21/09');
  });
});
