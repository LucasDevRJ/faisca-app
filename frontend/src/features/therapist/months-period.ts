import { useSearchParams } from 'react-router';
import { addDays, isValidDateOnly } from '../activities/week';

// Período da psiquiatra (DEC-099): os últimos 1, 2 ou 3 meses até um dia, sem o ciclo da agenda com a
// psicóloga. Fica na URL (?meses=3&ate=AAAA-MM-DD); sem ?ate, termina hoje. A última escolha de meses
// fica no aparelho, só como preferência de tela (nenhum dado de saúde).

export const MONTH_OPTIONS = [1, 2, 3] as const;
export type MonthCount = (typeof MONTH_OPTIONS)[number];
const DEFAULT_MONTHS: MonthCount = 3;
const STORAGE_KEY = 'faisca.periodo-meses';

// O tipo do período na tela: os textos mudam com ele ("neste ciclo", "nesta semana", "neste período").
export type PeriodScope = 'cycle' | 'week' | 'months';

export function inPeriod(scope: PeriodScope): string {
  return scope === 'cycle' ? 'neste ciclo' : scope === 'week' ? 'nesta semana' : 'neste período';
}

export function onPeriod(scope: PeriodScope): string {
  return scope === 'cycle' ? 'no ciclo' : scope === 'week' ? 'na semana' : 'no período';
}

function isMonthCount(value: unknown): value is MonthCount {
  return MONTH_OPTIONS.includes(value as MonthCount);
}

function readStoredMonths(): MonthCount {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return isMonthCount(stored) ? stored : DEFAULT_MONTHS;
  } catch {
    return DEFAULT_MONTHS;
  }
}

// 'AAAA-MM-DD' menos N meses, no mesmo dia (ou no último dia do mês, se ele não existir).
export function subtractMonths(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

// Do dia seguinte a "N meses antes" até `to`: 3 meses cabem nos 92 dias da API da profissional.
export function monthsRange(to: string, months: MonthCount): { from: string; to: string } {
  return { from: addDays(subtractMonths(to, months), 1), to };
}

export function useMonthsPeriod(today: string) {
  const [searchParams, setSearchParams] = useSearchParams();
  const param = Number(searchParams.get('meses'));
  const months: MonthCount = isMonthCount(param) ? param : readStoredMonths();
  const until = searchParams.get('ate');
  const to = isValidDateOnly(until) && until < today ? until : today;
  const range = monthsRange(to, months);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }

  return {
    months,
    range,
    isCurrent: to === today,
    setMonths(value: MonthCount) {
      try {
        localStorage.setItem(STORAGE_KEY, String(value));
      } catch {
        // Sem armazenamento (aba anônima, por exemplo): a escolha vale só nesta tela.
      }
      update({ meses: String(value) });
    },
    // O período de antes termina na véspera do atual.
    previous() {
      update({ ate: addDays(range.from, -1) });
    },
    // O seguinte termina N meses depois, sem passar de hoje.
    next() {
      const ahead = subtractMonths(to, -months);
      update({ ate: ahead >= today ? null : ahead });
    },
  };
}
