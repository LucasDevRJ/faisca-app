import { useId } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../links/link-format';
import { CATEGORY_TEXT, SCORE_TEXT } from './action-labels';
import type { Action } from './actions-api';

const STATUS_LABEL: Record<Action['status'], string> = {
  PLANEJADA: 'Planejada',
  AVALIADA: 'Feita',
  NAO_REALIZADA: 'Não deu desta vez',
};

export type ActionCardAction = 'evaluate' | 'notDone' | 'delete';

// readOnly: visão da terapeuta. Sem botões e com a hora em que o registro foi feito.
type ActionCardProps =
  | { action: Action; today: string; onAction: (kind: ActionCardAction, action: Action) => void; readOnly?: false }
  | { action: Action; readOnly: true };

// A expectativa ao lado do resultado (DEC-052): "Esperava 3 · Prazer 7 · Realização 6". Só os
// números, sem julgamento: comparar o que se esperava com o que aconteceu é o centro da Ação.
export function ActionCard(props: ActionCardProps) {
  const { action } = props;
  const titleId = useId();
  const planned = action.status === 'PLANEJADA';
  const dayArrived = !props.readOnly && action.actionDate <= props.today;

  const scores = (['expectation', 'pleasure', 'achievement'] as const)
    .filter((key) => action[key] !== null)
    .map((key) => ({ key, label: SCORE_TEXT[key].short, value: action[key] as number }));

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h4 id={titleId} className="text-lg font-semibold break-words">
            {action.name}
          </h4>
          <span className="self-start rounded-full border border-border px-2 py-0.5 text-sm text-muted">
            {CATEGORY_TEXT[action.category].label}
          </span>
        </div>
        <span className="rounded-sm bg-bg px-2 py-0.5 text-sm text-muted">{STATUS_LABEL[action.status]}</span>
      </div>

      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {scores.map((score) => (
          <div key={score.key} className="flex gap-1.5">
            <dt className="text-muted">{score.label}</dt>
            <dd className="font-semibold tabular-nums">{score.value}</dd>
          </div>
        ))}
      </dl>

      {action.observation && <p className="whitespace-pre-line text-muted">{action.observation}</p>}

      {props.readOnly && <p className="text-sm text-muted">Registrado em {formatDateTime(action.createdAt)}</p>}

      {!props.readOnly && planned && (
        <div className="flex flex-col gap-2">
          {/* Contar como foi, só a partir do dia da ação (DEC-051). */}
          {dayArrived && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button className="col-span-2 sm:col-auto" onClick={() => props.onAction('evaluate', action)}>
                Conta como foi?
              </Button>
              <Button variant="secondary" className="col-span-2 sm:col-auto" onClick={() => props.onAction('notDone', action)}>
                Não deu desta vez
              </Button>
            </div>
          )}
          <div className="flex gap-1">
            <Link
              to={`/acao/${action.id}/editar`}
              className="rounded-md px-3 py-2 font-medium text-primary-text hover:bg-bg"
              aria-label={`Editar ${action.name}`}
            >
              Editar
            </Link>
            <Button variant="ghost" className="px-3" onClick={() => props.onAction('delete', action)}>
              Excluir
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
