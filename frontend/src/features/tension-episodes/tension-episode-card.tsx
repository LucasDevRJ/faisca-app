import { useId } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { formatDateTime } from '../links/link-format';
import { FIELD_TEXT, formatEpisodeTime } from './tension-episode-labels';
import type { TensionEpisode } from './tension-episodes-api';

// readOnly: visão da terapeuta. Sem botões e sempre com a hora do registro (a SPEC mostra à
// terapeuta as duas datas; a do episódio vem no título do dia).
type TensionEpisodeCardProps =
  | { episode: TensionEpisode; onDelete: (episode: TensionEpisode) => void; readOnly?: false }
  | { episode: TensionEpisode; readOnly: true };

// Editar e excluir só no dia em que foi registrado (DEC-042). Depois disso, o registro fica
// fixo e o backend responderia 409: esconder os botões é conforto, não segurança.
export function TensionEpisodeCard(props: TensionEpisodeCardProps) {
  const { episode } = props;
  const titleId = useId();
  const canChange = !props.readOnly && episode.editable;

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
    >
      <h4 id={titleId} className="sr-only">
        Episódio: {episode.situation}
      </h4>
      <p className="text-sm font-medium text-muted first-letter:uppercase">{formatEpisodeTime(episode.episodeTime)}</p>
      <dl className="flex flex-col gap-3">
        <Field label={FIELD_TEXT.situation.label} text={episode.situation} />
        <div className="grid grid-cols-2 gap-2">
          <Score label={FIELD_TEXT.tensionLevel.label} value={episode.tensionLevel} />
          <Score label={FIELD_TEXT.vocalizeUrge.label} value={episode.vocalizeUrge} />
        </div>
        <Field label={FIELD_TEXT.behavior.label} text={episode.behavior} />
        <Field label={FIELD_TEXT.consequence.label} text={episode.consequence} />
      </dl>

      {(props.readOnly || !episode.editable) && (
        <p className="text-sm text-muted">Registrado em {formatDateTime(episode.createdAt)}</p>
      )}

      {canChange && (
        <div className="flex gap-1">
          <Link to={`/tensao/${episode.id}/editar`} className={buttonClasses('ghost', 'px-3')}>
            Editar
          </Link>
          <Button variant="ghost" className="px-3" onClick={() => props.onDelete(episode)}>
            Excluir
          </Button>
        </div>
      )}
    </article>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd>
        <p className="break-words whitespace-pre-line">{text}</p>
      </dd>
    </div>
  );
}

// Nota em uma cor só, variando o preenchimento (nunca vermelho/verde; frontend/CLAUDE.md).
function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-bg px-3 py-1.5">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="flex flex-col gap-1">
        <span className="font-semibold tabular-nums">
          {value} <span className="text-sm font-normal text-muted">de 10</span>
        </span>
        <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-border">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${value * 10}%` }} />
        </span>
      </dd>
    </div>
  );
}
