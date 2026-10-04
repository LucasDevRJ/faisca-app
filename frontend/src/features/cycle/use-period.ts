import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { addDays, isValidDateOnly, startOfWeek } from '../activities/week';
import type { Cycle, CycleResponse } from './cycle-api';

// Período das telas de registro (DEC-050): o ciclo da consulta, por padrão, ou a semana de segunda
// a domingo. Fica na URL: ?ciclo=AAAA-MM-DD (um dia do ciclo) ou ?semana=AAAA-MM-DD. Sem nenhum dos
// dois, o ciclo de hoje. Sem nenhuma sessão na agenda, não há ciclo, e vale a semana.

export type Period = {
  mode: 'cycle' | 'week';
  from: string;
  to: string;
  // Só no modo ciclo.
  cycle: Cycle | null;
  // Só no modo semana.
  monday: string | null;
  // A agenda tem sessões: dá para alternar entre ciclo e semana.
  hasCycle: boolean;
  isCurrent: boolean;
};

// Como perguntar o ciclo de um dia: o do próprio paciente ou o de um paciente da terapeuta.
export type CycleQueryFor = (date: string | null) => UseQueryOptions<CycleResponse>;

export function usePeriod(cycleQueryFor: CycleQueryFor, today: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const weekParam = searchParams.get('semana');
  const cycleParam = searchParams.get('ciclo');
  const weekMode = isValidDateOnly(weekParam);
  const cycleDate = !weekMode && isValidDateOnly(cycleParam) ? cycleParam : null;
  // No modo semana, pergunta pelo ciclo de hoje só para saber se há agenda.
  const query = useQuery(cycleQueryFor(cycleDate));
  const currentMonday = startOfWeek(today);

  // Troca só o período, mantendo o resto da URL (por exemplo, a aba da terapeuta).
  function setPeriod(key: 'ciclo' | 'semana' | null, value?: string) {
    const next = new URLSearchParams(searchParams);
    next.delete('ciclo');
    next.delete('semana');
    if (key && value) next.set(key, value);
    setSearchParams(next);
  }

  const cycle = query.data?.cycle ?? null;
  const hasCycle = cycle !== null;

  const actions = {
    showCycle: (date: string | null) => setPeriod(date ? 'ciclo' : null, date ?? undefined),
    // Sem agenda, a semana atual é o padrão: a URL fica limpa.
    showWeek: (monday: string) =>
      !hasCycle && monday === currentMonday ? setPeriod(null) : setPeriod('semana', monday),
  };
  const loading = !weekMode && query.isPending;

  let period: Period | null;
  if (loading) {
    period = null;
  } else if (!weekMode && cycle) {
    period = {
      mode: 'cycle',
      from: cycle.from,
      to: cycle.to,
      cycle,
      monday: null,
      hasCycle,
      isCurrent: cycle.from <= today && today <= cycle.to,
    };
  } else {
    // Semana pedida ou, sem agenda, a semana do dia pedido.
    const monday = weekMode ? startOfWeek(weekParam!) : startOfWeek(cycleDate ?? today);
    period = {
      mode: 'week',
      from: monday,
      to: addDays(monday, 6),
      cycle: null,
      monday,
      hasCycle: weekMode ? hasCycle : false,
      isCurrent: monday === currentMonday,
    };
  }

  return { period, currentMonday, ...actions };
}
