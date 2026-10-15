import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { LongText } from '../../components/ui/long-text';
import { formatDayMonth } from '../activities/week';
import { formatDateTime } from '../links/link-format';
import {
  alternativeAddedLater,
  emotionName,
  FIELD_TEXT,
  formatAlternativeDeadline,
} from './thought-record-labels';
import type { EmotionEntry, ThoughtRecord } from './thought-records-api';

// readOnly: visão da terapeuta. Sem botões e sempre com a hora do registro (a SPEC mostra à
// terapeuta as duas datas; a da situação vem no título do dia).
type ThoughtRecordCardProps =
  | { record: ThoughtRecord; onDelete: (record: ThoughtRecord) => void; readOnly?: false }
  | { record: ThoughtRecord; readOnly: true };

// Editar e excluir só no dia em que foi registrado (DEC-039). Depois disso, o registro fica
// fixo e o backend responderia 409: esconder os botões é conforto, não segurança.
export function ThoughtRecordCard(props: ThoughtRecordCardProps) {
  const { record } = props;
  const titleId = useId();
  const canChange = !props.readOnly && record.editable;
  // Depois do dia, sem alternativa: o botão de adicionar até a consulta, ou o convite para agendar.
  // Com o prazo encerrado, nada: o cartão não fala de prazo perdido (DEC-055).
  const missingAlternative = !props.readOnly && !record.editable && record.alternativeExplanation === null;
  const addedLater = alternativeAddedLater(record);

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
    >
      <h4 id={titleId} className="sr-only">
        Registro: {record.situation}
      </h4>
      <dl className="flex flex-col gap-3">
        <Field label={FIELD_TEXT.situation.label} text={record.situation} />
        <Field label={FIELD_TEXT.automaticThought.label} text={record.automaticThought}>
          <span className="text-sm text-muted">
            Acredito: <span className="font-semibold text-text tabular-nums">{record.beliefLevel}</span> de 10
          </span>
        </Field>
        <div className="flex flex-col gap-1.5">
          <dt className="text-sm font-medium text-muted">{FIELD_TEXT.emotions.label}</dt>
          <dd>
            <ul className="flex flex-wrap gap-2">
              {record.emotions.map((entry) => (
                <EmotionChip key={entry.emotion} entry={entry} />
              ))}
            </ul>
          </dd>
        </div>
        <Field label={FIELD_TEXT.behavior.label} text={record.behavior} />
        <Field label={FIELD_TEXT.consequence.label} text={record.consequence} />
        {/* Em destaque (pêssego), para a terapeuta achar rápido o que foi reestruturado. */}
        {record.alternativeExplanation !== null && (
          <div className="flex flex-col gap-0.5 rounded-md border-l-4 border-accent bg-accent/10 py-2 pr-3 pl-3">
            <dt className="text-sm font-medium text-accent-text">{FIELD_TEXT.alternativeExplanation.label}</dt>
            <dd className="flex flex-col gap-1">
              <LongText text={record.alternativeExplanation} />
              {addedLater && <span className="text-sm text-muted">Adicionada em {formatDayMonth(addedLater)}</span>}
            </dd>
          </div>
        )}
      </dl>

      {missingAlternative && record.canAddAlternative && record.alternativeDeadline && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to={`/pensamentos/${record.id}/alternativa`} className={buttonClasses('secondary')}>
            Adicionar explicação alternativa
          </Link>
          <span className="text-sm text-muted">{formatAlternativeDeadline(record.alternativeDeadline)}</span>
        </div>
      )}
      {missingAlternative && record.alternativeDeadline === null && (
        <p className="text-sm text-muted">
          Agende sua próxima consulta para poder adicionar a explicação alternativa.{' '}
          <Link to="/consultas" className="font-medium text-primary-text underline underline-offset-4">
            Ir para a agenda
          </Link>
        </p>
      )}

      {(props.readOnly || !record.editable) && (
        <p className="text-sm text-muted">Registrado em {formatDateTime(record.createdAt)}</p>
      )}

      {canChange && (
        <div className="flex gap-1">
          <Link to={`/pensamentos/${record.id}/editar`} className={buttonClasses('ghost', 'px-3')}>
            Editar
          </Link>
          <Button variant="ghost" className="px-3" onClick={() => props.onDelete(record)}>
            Excluir
          </Button>
        </div>
      )}
    </article>
  );
}

function Field({ label, text, children }: { label: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="flex flex-col gap-1">
        <LongText text={text} />
        {children}
      </dd>
    </div>
  );
}

// Intensidade em uma cor só, variando o preenchimento (nunca vermelho/verde; frontend/CLAUDE.md).
// Com o "como me sinto agora", mostra antes → agora (DEC-055); a barra segue a de antes.
function EmotionChip({ entry }: { entry: EmotionEntry }) {
  const after = entry.intensityAfter;
  return (
    <li className="flex min-w-28 flex-col gap-1 rounded-md border border-border bg-bg px-3 py-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="font-medium break-words">{emotionName(entry)}</span>
        {after === null ? (
          <span className="font-semibold tabular-nums" aria-label={`intensidade ${entry.intensity} de 10`}>
            {entry.intensity}
          </span>
        ) : (
          <span
            className="font-semibold tabular-nums"
            aria-label={`intensidade ${entry.intensity} de 10; agora, ${after} de 10`}
          >
            {entry.intensity} → {after}
          </span>
        )}
      </span>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border">
        <span className="block h-full rounded-full bg-primary" style={{ width: `${entry.intensity * 10}%` }} />
      </span>
    </li>
  );
}
