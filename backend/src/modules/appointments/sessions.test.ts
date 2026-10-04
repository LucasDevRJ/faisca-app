import { describe, expect, it } from 'vitest';
import { buildCalendar } from './calendar.js';
import {
  hasStarted,
  lastAndNext,
  ruleDates,
  sessionsBetween,
  therapyStatus,
  upcomingSessions,
  type AgendaData,
  type ScheduleData,
} from './sessions.js';

// Quarta, 07/10/2026, às 14:00, toda semana.
const weekly: ScheduleData = { id: 's1', startDate: '2026-10-07', time: '14:00', frequency: 'SEMANAL', endDate: null };

function agenda(overrides: Partial<AgendaData> = {}): AgendaData {
  return { schedules: [weekly], exceptions: [], pauses: [], extras: [], ...overrides };
}

const dates = (data: AgendaData, from: string, to: string) => sessionsBetween(data, from, to).map((s) => s.date);

describe('ruleDates (DEC-045)', () => {
  it('semanal: a partir da primeira sessão, de 7 em 7 dias', () => {
    expect(ruleDates(weekly, '2026-10-01', '2026-10-31')).toEqual(['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']);
  });

  it('quinzenal: de 14 em 14 dias, alinhado com a primeira sessão mesmo começando no meio', () => {
    const biweekly = { ...weekly, frequency: 'QUINZENAL' as const };
    expect(ruleDates(biweekly, '2026-10-15', '2026-11-30')).toEqual(['2026-10-21', '2026-11-04', '2026-11-18']);
  });

  it('a regra que terminou não passa do endDate (inclusive)', () => {
    expect(ruleDates({ ...weekly, endDate: '2026-10-14' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-07',
      '2026-10-14',
    ]);
    // Terminou antes de começar: nenhuma sessão.
    expect(ruleDates({ ...weekly, endDate: '2026-10-06' }, '2026-10-01', '2026-10-31')).toEqual([]);
  });
});

describe('sessionsBetween', () => {
  it('pausa sem volta tira as sessões a partir do início; com volta, até a véspera', () => {
    expect(dates(agenda({ pauses: [{ startDate: '2026-10-14', returnDate: null }] }), '2026-10-01', '2026-11-30')).toEqual([
      '2026-10-07',
    ]);
    expect(
      dates(agenda({ pauses: [{ startDate: '2026-10-10', returnDate: '2026-10-28' }] }), '2026-10-01', '2026-10-31'),
    ).toEqual(['2026-10-07', '2026-10-28']);
  });

  it('desmarcada continua no dia, com o motivo; remarcada aparece no dia novo', () => {
    const data = agenda({
      exceptions: [
        { scheduleId: 's1', originalDate: '2026-10-14', type: 'DESMARCADA', newDate: null, newTime: null, reason: 'Feriado' },
        { scheduleId: 's1', originalDate: '2026-10-21', type: 'REMARCADA', newDate: '2026-10-23', newTime: '09:30', reason: 'Viagem' },
      ],
    });

    const sessions = sessionsBetween(data, '2026-10-10', '2026-10-25');

    expect(sessions).toEqual([
      expect.objectContaining({ date: '2026-10-14', status: 'DESMARCADA', reason: 'Feriado', originalDate: '2026-10-14' }),
      expect.objectContaining({
        date: '2026-10-23',
        time: '09:30',
        status: 'AGENDADA',
        rescheduled: true,
        originalDate: '2026-10-21',
        reason: 'Viagem',
      }),
    ]);
  });

  it('remarcada some se a sessão original caiu numa pausa marcada depois', () => {
    const data = agenda({
      exceptions: [
        { scheduleId: 's1', originalDate: '2026-10-21', type: 'REMARCADA', newDate: '2026-10-23', newTime: '09:30', reason: 'Viagem' },
      ],
      pauses: [{ startDate: '2026-10-20', returnDate: null }],
    });
    expect(dates(data, '2026-10-20', '2026-10-31')).toEqual([]);
  });

  it('avulsas entram em ordem de dia e hora, com o id', () => {
    const data = agenda({ extras: [{ id: 'a1', date: '2026-10-09', time: '18:00' }] });
    expect(sessionsBetween(data, '2026-10-01', '2026-10-10')).toEqual([
      expect.objectContaining({ date: '2026-10-07', kind: 'RECORRENTE' }),
      expect.objectContaining({ date: '2026-10-09', kind: 'AVULSA', appointmentId: 'a1', originalDate: null }),
    ]);
  });
});

describe('hasStarted, lastAndNext e upcomingSessions', () => {
  it('a sessão de hoje é a próxima até a hora dela e vira a última depois', () => {
    const data = agenda();
    expect(lastAndNext(data, '2026-10-14', '13:59')).toEqual({
      last: expect.objectContaining({ date: '2026-10-07' }),
      next: expect.objectContaining({ date: '2026-10-14' }),
    });
    expect(lastAndNext(data, '2026-10-14', '14:00')).toEqual({
      last: expect.objectContaining({ date: '2026-10-14' }),
      next: expect.objectContaining({ date: '2026-10-21' }),
    });
  });

  it('avulsa antiga sem hora conta o dia todo', () => {
    expect(hasStarted({ date: '2026-10-14', time: null }, '2026-10-14', '00:00')).toBe(true);
  });

  it('desmarcada não é última nem próxima; a próxima pula a pausa', () => {
    const data = agenda({
      exceptions: [
        { scheduleId: 's1', originalDate: '2026-10-14', type: 'DESMARCADA', newDate: null, newTime: null, reason: 'Feriado' },
      ],
      pauses: [{ startDate: '2026-10-20', returnDate: '2026-11-03' }],
    });
    expect(lastAndNext(data, '2026-10-10', '10:00').next?.date).toBe('2026-11-04');
  });

  it('sem nada na agenda, última e próxima são null', () => {
    expect(lastAndNext(agenda({ schedules: [] }), '2026-10-10', '10:00')).toEqual({ last: null, next: null });
  });

  it('próximas: as que ainda não começaram, agendadas ou desmarcadas', () => {
    const data = agenda({
      exceptions: [
        { scheduleId: 's1', originalDate: '2026-10-21', type: 'DESMARCADA', newDate: null, newTime: null, reason: 'Feriado' },
      ],
    });
    expect(upcomingSessions(data, '2026-10-14', '15:00', 3).map((s) => [s.date, s.status])).toEqual([
      ['2026-10-21', 'DESMARCADA'],
      ['2026-10-28', 'AGENDADA'],
      ['2026-11-04', 'AGENDADA'],
    ]);
  });
});

describe('therapyStatus', () => {
  it('sem agenda, ativa, pausada e encerrada', () => {
    expect(therapyStatus({ ...agenda({ schedules: [] }), lastEndReason: null }, '2026-10-10')).toBe('SEM_AGENDA');
    expect(therapyStatus({ ...agenda(), lastEndReason: null }, '2026-10-10')).toBe('ATIVA');
    expect(
      therapyStatus({ ...agenda({ pauses: [{ startDate: '2026-10-10', returnDate: null }] }), lastEndReason: null }, '2026-10-10'),
    ).toBe('PAUSADA');
    expect(
      therapyStatus({ ...agenda({ schedules: [{ ...weekly, endDate: '2026-10-07' }] }), lastEndReason: 'ENCERRAMENTO' }, '2026-10-10'),
    ).toBe('ENCERRADA');
  });
});

describe('buildCalendar (.ics)', () => {
  it('uma sessão por evento, texto neutro, desmarcada como cancelada', () => {
    const data = agenda({
      exceptions: [
        { scheduleId: 's1', originalDate: '2026-10-14', type: 'DESMARCADA', newDate: null, newTime: null, reason: 'Motivo fictício' },
      ],
    });

    const ics = buildCalendar(data, new Date('2026-10-06T12:00:00Z'));

    expect(ics).toContain('DTSTART;TZID=America/Sao_Paulo:20261007T140000');
    expect(ics).toContain('UID:sessao-2026-10-14@minhafaisca.com.br\r\nDTSTAMP:20261006T120000Z');
    expect(ics).toMatch(/sessao-2026-10-14[\s\S]*?STATUS:CANCELLED/);
    expect(ics).toContain('SUMMARY:Consulta');
    // Nada além de "Consulta": o motivo não vai para fora do app.
    expect(ics).not.toContain('Motivo fictício');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });
});
