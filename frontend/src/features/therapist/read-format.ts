import { formatDayMonth, todayInAppZone } from '../activities/week';
import type { UnreadResponse } from './read-marks-api';

// Textos do "Lido" (DEC-058): "para ler", e não "não lido", para soar como tarefa tranquila.

// "Lido em 18/10", no dia de São Paulo.
export function formatReadAt(readAt: string): string {
  return `Lido em ${formatDayMonth(todayInAppZone(new Date(readAt)))}`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

// "2 pensamentos · 1 episódio de tensão · 2 ações", só com as áreas que têm algo para ler.
export function unreadBreakdown(counts: UnreadResponse['counts']): string {
  const parts: string[] = [];
  if (counts.thoughtRecords) parts.push(plural(counts.thoughtRecords, 'pensamento', 'pensamentos'));
  if (counts.tensionEpisodes) parts.push(plural(counts.tensionEpisodes, 'episódio de tensão', 'episódios de tensão'));
  if (counts.actions) parts.push(plural(counts.actions, 'ação', 'ações'));
  return parts.join(' · ');
}

export function unreadTotal(counts: UnreadResponse['counts']): number {
  return (counts.thoughtRecords ?? 0) + (counts.tensionEpisodes ?? 0) + (counts.actions ?? 0);
}

// "5 registros para ler" / "1 registro para ler".
export function toReadLabel(count: number): string {
  return `${plural(count, 'registro', 'registros')} para ler`;
}
