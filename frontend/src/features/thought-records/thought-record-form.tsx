import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { isValidDateOnly, todayInAppZone } from '../activities/week';
import {
  EMOTION_LABEL,
  EMOTIONS,
  FIELD_TEXT,
  INTENSITY_TEXT,
  OTHER_LABEL_MAX,
  TEXT_MAX,
} from './thought-record-labels';
import type { Emotion, ThoughtRecord, ThoughtRecordInput } from './thought-records-api';

type TextKey = 'situation' | 'automaticThought' | 'behavior' | 'consequence';
const TEXT_FIELDS: TextKey[] = ['situation', 'automaticThought', 'behavior', 'consequence'];

type EmotionState = { intensity: number | null; otherLabel: string };
type Errors = Partial<Record<string, string>>;

const EMPTY_MESSAGE: Record<TextKey, string> = {
  situation: 'Conte qual foi a situação.',
  automaticThought: 'Conte qual pensamento veio.',
  behavior: 'Conte o que você fez.',
  consequence: 'Conte qual foi a consequência.',
};

type ThoughtRecordFormProps = {
  initial?: ThoughtRecord;
  initialDate: string;
  submitLabel: string;
  pending: boolean;
  // Erro da API: texto geral e erros por campo (VALIDATION_ERROR).
  apiError: { message: string; fields: Record<string, string> } | null;
  cancelTo: string;
  onSubmit: (input: ThoughtRecordInput) => void;
};

// Formulário do Registro de Pensamentos, em página própria (DEC-040). Todos os campos são
// obrigatórios (SPEC). A validação aqui só avisa antes; quem decide é a API.
export function ThoughtRecordForm({
  initial,
  initialDate,
  submitLabel,
  pending,
  apiError,
  cancelTo,
  onSubmit,
}: ThoughtRecordFormProps) {
  const [date, setDate] = useState(initial?.situationDate ?? initialDate);
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    situation: initial?.situation ?? '',
    automaticThought: initial?.automaticThought ?? '',
    behavior: initial?.behavior ?? '',
    consequence: initial?.consequence ?? '',
  });
  const [belief, setBelief] = useState<number | null>(initial?.beliefLevel ?? null);
  const [emotions, setEmotions] = useState<Partial<Record<Emotion, EmotionState>>>(() =>
    Object.fromEntries(
      (initial?.emotions ?? []).map((e) => [e.emotion, { intensity: e.intensity, otherLabel: e.otherLabel ?? '' }]),
    ),
  );
  const [errors, setErrors] = useState<Errors>({});

  const selected = EMOTIONS.filter((emotion) => emotions[emotion]);

  function toggleEmotion(emotion: Emotion, on: boolean) {
    setEmotions((current) => {
      const next = { ...current };
      if (on) next[emotion] = { intensity: null, otherLabel: '' };
      else delete next[emotion];
      return next;
    });
  }

  function updateEmotion(emotion: Emotion, change: Partial<EmotionState>) {
    setEmotions((current) => ({ ...current, [emotion]: { ...current[emotion]!, ...change } }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!isValidDateOnly(date)) next.situationDate = 'Escolha uma data.';
    else if (date > todayInAppZone()) next.situationDate = 'Esse dia ainda não chegou. Escolha hoje ou um dia anterior.';
    for (const key of TEXT_FIELDS) {
      const value = texts[key].trim();
      if (!value) next[key] = EMPTY_MESSAGE[key];
      else if (value.length > TEXT_MAX) next[key] = `Este campo pode ter até ${TEXT_MAX} caracteres.`;
    }
    if (belief === null) next.beliefLevel = 'Escolha um número de 0 a 10.';
    if (selected.length === 0) next.emotions = 'Escolha pelo menos uma emoção.';
    for (const emotion of selected) {
      const state = emotions[emotion]!;
      if (state.intensity === null) next[`intensity.${emotion}`] = 'Escolha a intensidade, de 0 a 10.';
      if (emotion === 'OUTRA') {
        const label = state.otherLabel.trim();
        if (!label) next.otherLabel = 'Escreva o nome da emoção.';
        else if (label.length > OTHER_LABEL_MAX) next.otherLabel = `O nome pode ter até ${OTHER_LABEL_MAX} caracteres.`;
      }
    }
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;

    onSubmit({
      situationDate: date,
      situation: texts.situation.trim(),
      automaticThought: texts.automaticThought.trim(),
      beliefLevel: belief!,
      emotions: selected.map((emotion) => {
        const state = emotions[emotion]!;
        return emotion === 'OUTRA'
          ? { emotion, intensity: state.intensity!, otherLabel: state.otherLabel.trim() }
          : { emotion, intensity: state.intensity! };
      }),
      behavior: texts.behavior.trim(),
      consequence: texts.consequence.trim(),
    });
  }

  const fieldError = (key: string) => errors[key] ?? apiError?.fields[key];

  const textArea = (key: TextKey) => (
    <TextAreaField
      label={FIELD_TEXT[key].label}
      hint={FIELD_TEXT[key].hint}
      value={texts[key]}
      maxLength={TEXT_MAX}
      onChange={(e) => setTexts((current) => ({ ...current, [key]: e.target.value }))}
      error={fieldError(key)}
    />
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}

      <TextField
        label={FIELD_TEXT.situationDate.label}
        type="date"
        value={date}
        max={todayInAppZone()}
        onChange={(e) => setDate(e.target.value)}
        error={fieldError('situationDate')}
      />
      {textArea('situation')}
      {textArea('automaticThought')}
      <ScoreField
        label={FIELD_TEXT.beliefLevel.label}
        minLabel={FIELD_TEXT.beliefLevel.min}
        maxLabel={FIELD_TEXT.beliefLevel.max}
        value={belief}
        onChange={setBelief}
        error={fieldError('beliefLevel')}
      />

      <fieldset className="flex flex-col gap-3" aria-describedby="emotions-hint">
        <legend className="mb-1 font-medium">{FIELD_TEXT.emotions.label}</legend>
        <p id="emotions-hint" className="text-sm text-muted">
          {FIELD_TEXT.emotions.hint}
        </p>
        <div className="flex flex-wrap gap-2">
          {EMOTIONS.map((emotion) => (
            <label
              key={emotion}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 has-checked:border-primary has-checked:bg-bg"
            >
              <input
                type="checkbox"
                checked={Boolean(emotions[emotion])}
                onChange={(e) => toggleEmotion(emotion, e.target.checked)}
                className="accent-primary"
              />
              {EMOTION_LABEL[emotion]}
            </label>
          ))}
        </div>
        {fieldError('emotions') && <p className="text-sm text-accent-text">{fieldError('emotions')}</p>}

        {selected.map((emotion) => (
          <div key={emotion} className="flex flex-col gap-3 rounded-md border border-border p-3">
            {emotion === 'OUTRA' && (
              <TextField
                label="Qual emoção?"
                value={emotions.OUTRA!.otherLabel}
                maxLength={OTHER_LABEL_MAX}
                onChange={(e) => updateEmotion('OUTRA', { otherLabel: e.target.value })}
                error={fieldError('otherLabel')}
              />
            )}
            <ScoreField
              label={`Intensidade: ${emotion === 'OUTRA' ? emotions.OUTRA!.otherLabel.trim() || 'outra' : EMOTION_LABEL[emotion].toLowerCase()}`}
              minLabel={INTENSITY_TEXT.min}
              maxLabel={INTENSITY_TEXT.max}
              value={emotions[emotion]!.intensity}
              onChange={(intensity) => updateEmotion(emotion, { intensity })}
              error={fieldError(`intensity.${emotion}`)}
            />
          </div>
        ))}
      </fieldset>

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
