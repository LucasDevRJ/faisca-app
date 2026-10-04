import { api } from '../../lib/api';

// Ciclo da consulta (DEC-049): do dia seguinte à sessão anterior até o dia da sessão. Calculado
// pela API, a partir da agenda.
export type Cycle = {
  from: string;
  to: string;
  // A sessão que fecha o ciclo; null no ciclo aberto (sem próxima sessão).
  session: { date: string; time: string | null; kind: 'RECORRENTE' | 'AVULSA' } | null;
  // Passou de 42 dias: só os mais recentes.
  truncated: boolean;
  // Um dia do ciclo anterior e do seguinte, para as setas.
  previous: string | null;
  next: string | null;
};

// cycle null: sem nenhuma sessão na agenda (a tela usa a semana).
export type CycleResponse = { today: string; cycle: Cycle | null };

export async function fetchCycle(date?: string): Promise<CycleResponse> {
  const { data } = await api.get<CycleResponse>('/appointments/cycle', { params: date ? { date } : undefined });
  return data;
}
