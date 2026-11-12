import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { LongText } from '../../components/ui/long-text';
import { formatDateTime } from '../links/link-format';
import { formatEntryTime } from './plan-labels';
import type { PlanEntry } from './plans-api';

// readOnly: visão da terapeuta. Sem botões e sempre com a hora do registro. showPlan: na visão
// "Para ler", que junta registros de vários planos, o nome do plano vem no topo.
type PlanEntryCardProps =
  | { entry: PlanEntry; onDelete: (entry: PlanEntry) => void; readOnly?: false; showPlan?: boolean }
  | { entry: PlanEntry; readOnly: true; footer?: ReactNode; showPlan?: boolean };

// Editar e excluir só no dia em que foi registrado (DEC-094). Depois disso, o registro fica fixo e
// o backend responderia 409: esconder os botões é conforto, não segurança.
export function PlanEntryCard(props: PlanEntryCardProps) {
  const { entry } = props;
  const titleId = useId();
  const canChange = !props.readOnly && entry.editable;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
    >
      <h4 id={titleId} className="sr-only">
        Registro do plano {entry.planTitle}, {formatEntryTime(entry.entryTime)}
      </h4>
      {props.showPlan && <p className="font-semibold break-words">Plano: {entry.planTitle}</p>}
      <p className="text-sm font-medium text-muted first-letter:uppercase">{formatEntryTime(entry.entryTime)}</p>
      {/* As perguntas são a cópia de quando o registro foi feito (DEC-094). */}
      <dl className="flex flex-col gap-3">
        {entry.questions.map((question, index) => (
          <div key={index} className="flex flex-col gap-0.5">
            <dt className="text-sm font-medium text-muted break-words">{question}</dt>
            <dd>
              {entry.answers[index] ? (
                <LongText text={entry.answers[index]} />
              ) : (
                <span className="text-muted italic">Sem resposta</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {(props.readOnly || !entry.editable) && (
        <p className="text-sm text-muted">Registrado em {formatDateTime(entry.createdAt)}</p>
      )}

      {props.readOnly && props.footer}

      {canChange && (
        <div className="flex gap-1">
          {/* Nome único para leitor de tela: num dia com vários registros, não fica "Editar, Editar". */}
          <Link to={`/planos/registros/${entry.id}/editar`} className={buttonClasses('ghost', 'px-3')}>
            Editar<span className="sr-only"> o registro {formatEntryTime(entry.entryTime)}</span>
          </Link>
          <Button variant="ghost" className="px-3" onClick={() => props.onDelete(entry)}>
            Excluir<span className="sr-only"> o registro {formatEntryTime(entry.entryTime)}</span>
          </Button>
        </div>
      )}
    </article>
  );
}
