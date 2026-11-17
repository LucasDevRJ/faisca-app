import { api } from '../../lib/api';

// Ciclo da consulta (DEC-049/109): o dia da sessão fica nos dois ciclos, com virada na hora marcada.
// Calculado pela API, a partir da agenda.
export type Cycle = {
  from: string;
  to: string;
  // A sessão que fecha o ciclo; null no ciclo aberto (sem próxima sessão).
  session: { date: string; time: string | null; kind: 'RECORRENTE' | 'AVULSA' } | null;
  completedSessionToday: { time: string } | null;
  isCurrent: boolean;
  // Próxima virada automática (UTC), só no ciclo atual quando a sessão ainda não começou hoje.
  nextChangeAt: string | null;
  // Passou de 42 dias: só os mais recentes.
  truncated: boolean;
  // Um dia do ciclo anterior e do seguinte, para as setas.
  previous: string | null;
  next: string | null;
};

// cycle null: sem nenhuma sessão na agenda (a tela usa a semana).
export type CycleResponse = { today: string; cycle: Cycle | null };

export function cycleRefreshInterval(response: CycleResponse | undefined, date: string | null, now = Date.now()) {
  if (date !== null || !response?.cycle?.nextChangeAt) return false;
  const remaining = Date.parse(response.cycle.nextChangeAt) - now;
  // Margem curta evita pedir antes de o relógio do servidor alcançar o minuto marcado; ao perder
  // a hora (por exemplo, com a aba suspensa), tenta novamente em vez de ficar preso no ciclo velho.
  return remaining >= 0 ? remaining + 250 : 15_000;
}

export async function fetchCycle(date?: string): Promise<CycleResponse> {
  const { data } = await api.get<CycleResponse>('/appointments/cycle', { params: date ? { date } : undefined });
  return data;
}
