import type { ReactNode } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { addDays, formatDayMonth, formatWeekRange } from '../activities/week';
import { countdown, CYCLE_MAX_DAYS, type Audience } from './cycle-format';
import type { Period } from './use-period';

// Cabeçalho do período (DEC-050): alternância Ciclo | Semana, setas, título e, no ciclo, quantos
// dias faltam para a consulta e o resumo do que foi registrado.

type PeriodNavProps = {
  period: Period;
  today: string;
  audience: Audience;
  onCycle: (date: string | null) => void;
  onWeek: (monday: string) => void;
  currentMonday: string;
  // Botões da tela, ao lado das setas (ex.: "Nova atividade").
  actions?: ReactNode;
  summary?: ReactNode;
};

export function PeriodNav({ period, today, audience, onCycle, onWeek, currentMonday, actions, summary }: PeriodNavProps) {
  const { cycle, monday } = period;
  const inCycle = period.mode === 'cycle' && cycle !== null;

  let title: string;
  let subtitle: string | null = null;
  if (inCycle) {
    title = cycle.session ? `Consulta de ${formatDayMonth(cycle.session.date)}` : 'Desde a última consulta';
    const end = !cycle.session && cycle.to === today ? 'hoje' : formatDayMonth(cycle.to);
    subtitle = `${formatDayMonth(cycle.from)} a ${end}`;
  } else {
    title = formatWeekRange(monday!);
  }
  const note = inCycle && cycle.session ? countdown(cycle.session, today, audience) : null;

  const previous = inCycle ? cycle.previous : addDays(monday!, -7);
  const next = inCycle ? cycle.next : addDays(monday!, 7);
  const go = (target: string) => (inCycle ? onCycle(target) : onWeek(target));

  return (
    <div className="flex flex-col gap-3">
      {period.hasCycle && (
        <div role="group" aria-label="Período" className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant={inCycle ? 'primary' : 'secondary'} aria-pressed={inCycle} onClick={() => onCycle(null)}>
            Ciclo
          </Button>
          <Button variant={inCycle ? 'secondary' : 'primary'} aria-pressed={!inCycle} onClick={() => onWeek(currentMonday)}>
            Semana
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            className="px-3 text-2xl"
            aria-label={inCycle ? 'Ciclo anterior' : 'Semana anterior'}
            disabled={!previous}
            onClick={() => previous && go(previous)}
          >
            ‹
          </Button>
          <div className="flex min-w-40 flex-col items-center text-center">
            <h2 id="period-title" className="text-2xl font-bold" aria-live="polite">
              {title}
            </h2>
            {subtitle && <p className="text-muted">{subtitle}</p>}
          </div>
          <Button
            variant="ghost"
            className="px-3 text-2xl"
            aria-label={inCycle ? 'Próximo ciclo' : 'Próxima semana'}
            disabled={!next}
            onClick={() => next && go(next)}
          >
            ›
          </Button>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!period.isCurrent && (
            <Button variant="secondary" onClick={() => (inCycle ? onCycle(null) : onWeek(currentMonday))}>
              {inCycle ? 'Voltar para o ciclo atual' : 'Voltar para esta semana'}
            </Button>
          )}
          {actions}
        </div>
      </div>

      {note && <p className="text-center sm:text-left">{note}</p>}
      {inCycle && cycle.truncated && (
        <Alert>
          Este ciclo passou de {CYCLE_MAX_DAYS} dias. Mostramos os {CYCLE_MAX_DAYS} dias mais recentes.
        </Alert>
      )}
      {inCycle && summary}
    </div>
  );
}
