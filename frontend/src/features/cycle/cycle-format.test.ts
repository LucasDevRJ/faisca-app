import { describe, expect, it } from 'vitest';
import { countdown } from './cycle-format';

describe('countdown da consulta', () => {
  it('fala que a sessão foi hoje depois do horário marcado', () => {
    const session = { date: '2026-10-21', time: '14:00' };
    const completedSessionToday = { time: '14:00' };

    expect(countdown(session, '2026-10-14', 'patient', completedSessionToday)).toBe('Sua consulta foi hoje, às 14:00.');
    expect(countdown(session, '2026-10-14', 'therapist', completedSessionToday)).toBe('A consulta foi hoje, às 14:00.');
  });

  it('mantém o convite para a consulta de hoje antes do horário', () => {
    expect(countdown({ date: '2026-10-14', time: '14:00' }, '2026-10-14', 'patient')).toBe(
      'Sua consulta é hoje, às 14:00.',
    );
  });
});
