import { daysBetween } from '../activities/week';

// Mesmo teto da API (DEC-049).
export const CYCLE_MAX_DAYS = 42;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// Resumo neutro do ciclo (DEC-050): "7 dias · 5 atividades feitas · 2 pensamentos registrados ·
// 1 episódio de tensão". Só números, sem meta nem comparação. Parte sem dado (sem aceite ou ainda
// carregando) fica de fora.
export function cycleSummaryText(
  range: { from: string; to: string },
  counts: { activitiesDone?: number; thoughts?: number; tension?: number; actionsDone?: number },
): string {
  const parts = [plural(daysBetween(range.from, range.to) + 1, 'dia', 'dias')];
  if (counts.activitiesDone !== undefined) {
    parts.push(plural(counts.activitiesDone, 'atividade feita', 'atividades feitas'));
  }
  if (counts.thoughts !== undefined) {
    parts.push(plural(counts.thoughts, 'pensamento registrado', 'pensamentos registrados'));
  }
  if (counts.tension !== undefined) {
    parts.push(plural(counts.tension, 'episódio de tensão', 'episódios de tensão'));
  }
  if (counts.actionsDone !== undefined) {
    parts.push(plural(counts.actionsDone, 'ação feita', 'ações feitas'));
  }
  return parts.join(' · ');
}

export type Audience = 'patient' | 'therapist';

// "Sua consulta é daqui a 3 dias" (paciente) ou "A consulta é amanhã" (terapeuta). Só para a
// consulta de hoje em diante: ciclos que já passaram não contam dias.
export function countdown(session: { date: string; time: string | null }, today: string, audience: Audience) {
  const days = daysBetween(today, session.date);
  if (days < 0) return null;
  const subject = audience === 'patient' ? 'Sua consulta é' : 'A consulta é';
  if (days === 0) return `${subject} hoje${session.time ? `, às ${session.time}` : ''}.`;
  if (days === 1) return `${subject} amanhã.`;
  return `${subject} daqui a ${days} dias.`;
}
