import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDayHeading,
  formatDayMonth,
  formatFullDate,
  formatRelativeDay,
  formatShortDay,
  formatWeekRange,
  isValidDateOnly,
  startOfWeek,
  todayInAppZone,
  yearsSince,
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
    expect(formatDayMonth('2026-10-05')).toBe('05/10');
    expect(formatFullDate('2026-10-05')).toBe('05/10/2026');
    expect(formatFullDate('2025-12-31')).toBe('31/12/2025');
    expect(formatShortDay('2026-09-28')).toBe('seg, 28/09');
    expect(formatShortDay('2026-10-04')).toBe('dom, 04/10');
  });
});

describe('dias relativos', () => {
  it('conta os dias e escreve em pt-BR', () => {
    expect(daysBetween('2026-09-27', '2026-10-04')).toBe(7);
    expect(formatRelativeDay('2026-09-27', '2026-09-27')).toBe('hoje');
    expect(formatRelativeDay('2026-09-28', '2026-09-27')).toBe('amanhã');
    expect(formatRelativeDay('2026-10-04', '2026-09-27')).toBe('em 7 dias');
    expect(formatRelativeDay('2026-09-24', '2026-09-27')).toBe('há 3 dias');
  });
});

describe('ano nas datas de outro ano (DEC-120)', () => {
  const today = '2026-01-05';

  it('mostra o ano só quando a data é de outro ano, no passado e no futuro', () => {
    expect(formatDayMonth('2026-01-02', { today })).toBe('02/01');
    expect(formatDayMonth('2025-12-30', { today })).toBe('30/12/2025');
    expect(formatDayMonth('2027-01-05', { today })).toBe('05/01/2027');
    expect(formatDayHeading('2025-12-30', { today })).toBe('terça-feira, 30/12/2025');
    expect(formatShortDay('2025-12-30', { today })).toBe('ter, 30/12/2025');
  });

  it('nos eixos dos gráficos, sem o ano', () => {
    expect(formatDayMonth('2025-12-30', { today, year: false })).toBe('30/12');
  });

  it('semana de outro ano e semana da virada', () => {
    expect(formatWeekRange('2025-09-15', { today })).toBe('15 a 21 de set. de 2025');
    expect(formatWeekRange('2025-12-29', { today })).toBe('29 de dez. de 2025 a 4 de jan.');
    expect(formatWeekRange('2025-12-29', { today: '2025-12-31' })).toBe('29 de dez. a 4 de jan. de 2026');
    expect(formatWeekRange('2026-01-05', { today })).toBe('5 a 11 de jan.');
  });

  it('conta os anos completos', () => {
    expect(yearsSince('2025-01-06', today)).toBe(0);
    expect(yearsSince('2025-01-05', today)).toBe(1);
    expect(yearsSince('2023-06-10', today)).toBe(2);
    expect(yearsSince('2027-01-05', today)).toBe(0);
  });
});
