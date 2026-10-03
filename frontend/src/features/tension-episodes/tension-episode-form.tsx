import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { isValidDateOnly, nowTimeInAppZone, todayInAppZone } from '../activities/week';
import { FIELD_TEXT, TEXT_MAX } from './tension-episode-labels';
import type { TensionEpisode, TensionEpisodeInput } from './tension-episodes-api';

type TextKey = 'situation' | 'behavior' | 'consequence';
const TEXT_FIELDS: TextKey[] = ['situation', 'behavior', 'consequence'];
type ScoreKey = 'tensionLevel' | 'vocalizeUrge';
type Errors = Partial<Record<string, string>>;

const EMPTY_MESSAGE: Record<TextKey, string> = {
  situation: 'Conte o que estava acontecendo.',
  behavior: 'Conte o que você fez.',
  consequence: 'Conte o que aconteceu depois.',
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type TensionEpisodeFormProps = {
  initial?: TensionEpisode;
  initialDate: string;
  submitLabel: string;
  pending: boolean;
  // Erro da API: texto geral e erros por campo (VALIDATION_ERROR).
  apiError: { message: string; fields: Record<string, string> } | null;
  cancelTo: string;
  onSubmit: (input: TensionEpisodeInput) => void;
};

// Formulário dos Episódios de tensão, em página própria (DEC-043). Tudo obrigatório, menos a hora
// (SPEC). A validação aqui só avisa antes; quem decide é a API.
export function TensionEpisodeForm({
  initial,
  initialDate,
  submitLabel,
  pending,
  apiError,
  cancelTo,
  onSubmit,
}: TensionEpisodeFormProps) {
  const [date, setDate] = useState(initial?.episodeDate ?? initialDate);
  const [time, setTime] = useState(initial?.episodeTime ?? '');
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    situation: initial?.situation ?? '',
    behavior: initial?.behavior ?? '',
    consequence: initial?.consequence ?? '',
  });
  const [scores, setScores] = useState<Record<ScoreKey, number | null>>({
    tensionLevel: initial?.tensionLevel ?? null,
    vocalizeUrge: initial?.vocalizeUrge ?? null,
  });
  const [errors, setErrors] = useState<Errors>({});

  function validate(): Errors {
    const next: Errors = {};
    const today = todayInAppZone();
    if (!isValidDateOnly(date)) next.episodeDate = 'Escolha uma data.';
    else if (date > today) next.episodeDate = 'Esse dia ainda não chegou. Escolha hoje ou um dia anterior.';
    if (time && !TIME.test(time)) next.episodeTime = 'Escolha uma hora válida, ou deixe em branco.';
    else if (time && date === today && time > nowTimeInAppZone())
      next.episodeTime = 'Essa hora ainda não chegou. Escolha uma hora que já passou, ou deixe em branco.';
    for (const key of TEXT_FIELDS) {
      const value = texts[key].trim();
      if (!value) next[key] = EMPTY_MESSAGE[key];
      else if (value.length > TEXT_MAX) next[key] = `Este campo pode ter até ${TEXT_MAX} caracteres.`;
    }
    for (const key of ['tensionLevel', 'vocalizeUrge'] as const) {
      if (scores[key] === null) next[key] = 'Escolha um número de 0 a 10.';
    }
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    onSubmit({
      episodeDate: date,
      episodeTime: time || null,
      situation: texts.situation.trim(),
      tensionLevel: scores.tensionLevel!,
      vocalizeUrge: scores.vocalizeUrge!,
      behavior: texts.behavior.trim(),
      consequence: texts.consequence.trim(),
    });
  }

  const fieldError = (key: string) => errors[key] ?? apiError?.fields[key];

  const textArea = (key: TextKey) => (
    <TextAreaField
      label={FIELD_TEXT[key].label}
      hint={key === 'situation' ? FIELD_TEXT.situation.hint : undefined}
      value={texts[key]}
      maxLength={TEXT_MAX}
      onChange={(e) => setTexts((current) => ({ ...current, [key]: e.target.value }))}
      error={fieldError(key)}
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={FIELD_TEXT.episodeDate.label}
          type="date"
          value={date}
          max={todayInAppZone()}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError('episodeDate')}
        />
        <TextField
          label={FIELD_TEXT.episodeTime.label}
          hint={FIELD_TEXT.episodeTime.hint}
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          error={fieldError('episodeTime')}
        />
      </div>
      {textArea('situation')}
      <ScoreField
        label={FIELD_TEXT.tensionLevel.label}
        minLabel={FIELD_TEXT.tensionLevel.min}
        maxLabel={FIELD_TEXT.tensionLevel.max}
        value={scores.tensionLevel}
        onChange={(tensionLevel) => setScores((current) => ({ ...current, tensionLevel }))}
        error={fieldError('tensionLevel')}
      />
      <ScoreField
        label={FIELD_TEXT.vocalizeUrge.label}
        hint={FIELD_TEXT.vocalizeUrge.hint}
        minLabel={FIELD_TEXT.vocalizeUrge.min}
        maxLabel={FIELD_TEXT.vocalizeUrge.max}
        value={scores.vocalizeUrge}
        onChange={(vocalizeUrge) => setScores((current) => ({ ...current, vocalizeUrge }))}
        error={fieldError('vocalizeUrge')}
      />
      {textArea('behavior')}
      {textArea('consequence')}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : submitLabel}
        </Button>
        <Link to={cancelTo} className={buttonClasses('secondary')}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
