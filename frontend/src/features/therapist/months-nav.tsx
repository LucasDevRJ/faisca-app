import { Button } from '../../components/ui/button';
import { formatDayMonth } from '../activities/week';
import { MONTH_OPTIONS, type MonthCount } from './months-period';

const LABEL: Record<MonthCount, string> = { 1: '1 mês', 2: '2 meses', 3: '3 meses' };

type MonthsNavProps = {
  months: MonthCount;
  range: { from: string; to: string };
  isCurrent: boolean;
  onMonths: (months: MonthCount) => void;
  onPrevious: () => void;
  onNext: () => void;
};

// Navegação da psiquiatra (DEC-099): quantos meses ver e as setas para voltar no tempo. Consultas de
// 1 em 1 a 3 em 3 meses: o período cobre o intervalo entre elas.
export function MonthsNav({ months, range, isCurrent, onMonths, onPrevious, onNext }: MonthsNavProps) {
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Quantos meses ver" className="grid grid-cols-3 gap-2 sm:flex">
        {MONTH_OPTIONS.map((option) => (
          <Button
            key={option}
            variant={option === months ? 'primary' : 'secondary'}
            aria-pressed={option === months}
            className="px-2 text-sm sm:px-5 sm:text-base"
            onClick={() => onMonths(option)}
          >
            {LABEL[option]}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="min-w-11 px-3" aria-label="Período anterior" onClick={onPrevious}>
          ‹
        </Button>
        <div className="flex flex-col" aria-live="polite">
          <h2 id="period-title" className="text-xl font-semibold">
            {formatDayMonth(range.from)} a {formatDayMonth(range.to)}
          </h2>
          <p className="text-sm text-muted">
            {isCurrent ? (months === 1 ? 'Último mês' : `Últimos ${months} meses`) : LABEL[months]}
          </p>
        </div>
        <Button
          variant="ghost"
          className="min-w-11 px-3"
          aria-label="Próximo período"
          disabled={isCurrent}
          onClick={onNext}
        >
          ›
        </Button>
      </div>
    </div>
  );
}
