import { useId } from 'react';
import { Button } from '../../components/ui/button';
import { formatDateTime } from '../links/link-format';
import { isFinal, type Activity } from './activities-api';
import { SCORE_TEXT, STATUS_LABEL } from './activity-labels';

// Botão de meia largura na grade do celular: texto menor e sem quebra, para caber em 360px.
const HALF_WIDTH = 'px-2 text-sm whitespace-nowrap sm:px-5 sm:text-base';

export type ActivityAction = 'start' | 'complete' | 'notDone' | 'edit' | 'delete';

// readOnly: visão da terapeuta (DEC-033). Sem botões e com a hora em que o registro foi feito,
// porque a SPEC mostra à terapeuta as duas datas (a do dia vem no título do dia).
type ActivityCardProps =
  | {
      activity: Activity;
      today: string;
      onAction: (action: ActivityAction, activity: Activity) => void;
      readOnly?: false;
    }
  | { activity: Activity; readOnly: true };

// Os botões seguem o estado (tabela da SPEC). Registro final não tem ações: ele é imutável
// e o backend responderia 409. Esconder os botões é conforto, não segurança.
export function ActivityCard(props: ActivityCardProps) {
  const { activity } = props;
  const titleId = useId();
  const final = isFinal(activity.status);
  // Concluir ou marcar "não aconteceu" só a partir do dia da atividade (DEC-028).
  const dayArrived = !props.readOnly && activity.activityDate <= props.today;

  const scores = (['wantBefore', 'pleasure', 'achievement'] as const)
    .filter((key) => activity[key] !== null)
    .map((key) => ({ key, label: SCORE_TEXT[key].label, value: activity[key] as number }));

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 id={titleId} className="text-lg font-semibold break-words">
          {activity.name}
        </h4>
        <span className="rounded-sm bg-bg px-2 py-0.5 text-sm text-muted">{STATUS_LABEL[activity.status]}</span>
      </div>

      {scores.length > 0 && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {scores.map((score) => (
            <div key={score.key} className="flex gap-1.5">
              <dt className="text-muted">{score.label}</dt>
              <dd className="font-semibold tabular-nums">{score.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {activity.observation && <p className="text-muted whitespace-pre-line">{activity.observation}</p>}

      {props.readOnly && <p className="text-sm text-muted">Registrado em {formatDateTime(activity.createdAt)}</p>}

      {!props.readOnly && !final && (
        <div className="flex flex-col gap-2">
          {/* No celular, grade de duas colunas: a ação principal ocupa a linha toda.
              A partir do sm, uma linha só. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {dayArrived && (
              <Button className="col-span-2 sm:col-auto" onClick={() => props.onAction('complete', activity)}>
                Conta como foi?
              </Button>
            )}
            {activity.status === 'PLANEJADA' && (
              <Button
                variant={dayArrived ? 'secondary' : 'primary'}
                className={dayArrived ? HALF_WIDTH : 'col-span-2 sm:col-auto'}
                onClick={() => props.onAction('start', activity)}
              >
                Registrar vontade
              </Button>
            )}
            {dayArrived && (
              <Button
                variant="secondary"
                className={activity.status === 'PLANEJADA' ? HALF_WIDTH : 'col-span-2 sm:col-auto'}
                onClick={() => props.onAction('notDone', activity)}
              >
                Não aconteceu
              </Button>
            )}
          </div>
          {/* Editar e excluir ficam à parte, mais discretos que as ações do dia a dia. */}
          <div className="flex gap-1">
            <Button variant="ghost" className="px-3" onClick={() => props.onAction('edit', activity)}>
              Editar
            </Button>
            <Button variant="ghost" className="px-3" onClick={() => props.onAction('delete', activity)}>
              Excluir
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
