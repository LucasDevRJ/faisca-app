import { formatDayHeading, formatDayMonth, formatRelativeDay } from '../activities/week';
import type { AgendaStatus, Pause, Schedule } from './appointments-api';

// Textos da agenda (DEC-045), iguais no card, na página de consultas e na visão da terapeuta.

const weekdayLong = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long' });

function weekdayOf(date: string): string {
  return weekdayLong.format(new Date(`${date}T00:00:00.000Z`));
}

// "quarta-feira, 07/10 às 14:00" (sem hora nas consultas de antes da agenda).
export function formatSessionDay(session: { date: string; time: string | null }): string {
  const day = formatDayHeading(session.date);
  return session.time ? `${day} às ${session.time}` : day;
}

// "em 3 dias", "hoje", "há 2 dias"
export function formatSessionDistance(session: { date: string }, today: string): string {
  return formatRelativeDay(session.date, today);
}

// "Toda quarta-feira, às 14:00" ou "A cada duas semanas, na quarta-feira, às 14:00".
export function describeSchedule(schedule: Schedule): string {
  const weekday = weekdayOf(schedule.startDate);
  // "sábado" e "domingo" pedem "todo"; os outros dias, "toda".
  const every = weekday === 'sábado' || weekday === 'domingo' ? 'Todo' : 'Toda';
  const on = weekday === 'sábado' || weekday === 'domingo' ? 'no' : 'na';
  return schedule.frequency === 'SEMANAL'
    ? `${every} ${weekday}, às ${schedule.time}`
    : `A cada duas semanas, ${on} ${weekday}, às ${schedule.time}`;
}

// "Em pausa até 20/10" (volta no dia 20) ou "Em pausa" (até retomar).
export function describePause(pause: Pause, today: string): string {
  if (pause.startDate > today) {
    const until = pause.returnDate ? ` até ${formatDayMonth(pause.returnDate)}` : '';
    return `Pausa marcada a partir de ${formatDayMonth(pause.startDate)}${until}`;
  }
  return pause.returnDate ? `Em pausa até ${formatDayMonth(pause.returnDate)}` : 'Em pausa';
}

// Selo curto da situação, para a lista de pacientes e o card. null quando está tudo normal.
export function statusBadge(status: AgendaStatus, pause: Pause | null, today: string): string | null {
  if (status === 'PAUSADA' && pause) return describePause(pause, today);
  if (status === 'ENCERRADA') return 'Terapia encerrada';
  if (status === 'SEM_AGENDA') return 'Sem agenda';
  return null;
}
