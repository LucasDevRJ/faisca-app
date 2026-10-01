import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateOnlyToDate,
  dateToDateOnly,
  daysBetween,
  startOfDayInAppZone,
  todayInAppZone,
} from './dates.js';

describe('todayInAppZone', () => {
  it('usa o dia de São Paulo, não o de UTC', () => {
    // 01:30 UTC do dia 10 ainda é 22:30 do dia 9 em São Paulo (UTC-3).
    expect(todayInAppZone(new Date('2026-03-10T01:30:00Z'))).toBe('2026-03-09');
    expect(todayInAppZone(new Date('2026-03-10T03:00:00Z'))).toBe('2026-03-10');
  });
});

describe('conversão de datas', () => {
  it('ida e volta sem mudar o dia', () => {
    expect(dateToDateOnly(dateOnlyToDate('2026-12-31'))).toBe('2026-12-31');
  });

  it('soma dias atravessando mês e ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('conta os dias entre duas datas', () => {
    expect(daysBetween('2026-09-21', '2026-09-27')).toBe(6);
    expect(daysBetween('2026-09-27', '2026-09-27')).toBe(0);
  });
});

describe('startOfDayInAppZone', () => {
  it('é a meia-noite de São Paulo, em UTC', () => {
    expect(startOfDayInAppZone('2026-10-01').toISOString()).toBe('2026-10-01T03:00:00.000Z');
  });

  it('um segundo antes ainda é o dia anterior em São Paulo', () => {
    const start = startOfDayInAppZone('2026-10-01');
    expect(todayInAppZone(start)).toBe('2026-10-01');
    expect(todayInAppZone(new Date(start.getTime() - 1000))).toBe('2026-09-30');
  });
});
