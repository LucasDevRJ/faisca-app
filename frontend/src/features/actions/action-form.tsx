import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { addDays, isValidDateOnly } from '../activities/week';
import { CATEGORIES, CATEGORY_TEXT, SCORE_TEXT } from './action-labels';
import type { Action, ActionCategory, CreateActionInput } from './actions-api';

// Formulário da Ação (DEC-052), em página própria: planejar ou, para algo que já foi feito,
// registrar já com a avaliação. Na edição de uma planejada, só os campos dela.

const NAME_MAX = 100;
const OBSERVATION_MAX = 1000;
// Mesmas janelas da API (DEC-051).
const PLAN_AHEAD_DAYS = 7;
const RECORD_BACK_DAYS = 7;

type Errors = Record<string, string | undefined>;

type ActionFormProps = {
  today: string;
  initial?: Partial<Pick<Action, 'actionDate' | 'name' | 'category' | 'expectation'>>;
  // Na edição, só planejar.
  editing?: boolean;
  submitLabel: string;
  pending: boolean;
  apiError: { message: string; fields: Record<string, string> } | null;
  cancelTo: string;
  onSubmit: (input: CreateActionInput) => void;
};

export function ActionForm({ today, initial, editing, submitLabel, pending, apiError, cancelTo, onSubmit }: ActionFormProps) {
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [actionDate, setActionDate] = useState(initial?.actionDate ?? today);
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<ActionCategory | null>(initial?.category ?? null);
  const [expectation, setExpectation] = useState<number | null>(initial?.expectation ?? null);
  const [pleasure, setPleasure] = useState<number | null>(null);
  const [achievement, setAchievement] = useState<number | null>(null);
  const [observation, setObservation] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  function dateError() {
    if (!isValidDateOnly(actionDate)) return 'Escolha uma data.';
    if (alreadyDone) {
      if (actionDate > today) return 'O que já foi feito precisa ser de hoje ou de um dia anterior.';
      if (actionDate < addDays(today, -RECORD_BACK_DAYS)) return `Dá para registrar o que foi feito nos últimos ${RECORD_BACK_DAYS} dias.`;
      return undefined;
    }
    // Na edição, o dia que já estava (mesmo passado) continua valendo.
    if (editing && actionDate === initial?.actionDate) return undefined;
    if (actionDate < today) return 'Planeje para hoje ou para um dia que ainda vai chegar.';
    if (actionDate > addDays(today, PLAN_AHEAD_DAYS)) return `Planeje para até ${PLAN_AHEAD_DAYS} dias à frente.`;
    return undefined;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    const next: Errors = {
      actionDate: dateError(),
      name: !trimmed ? 'Conte qual é a ação.' : trimmed.length > NAME_MAX ? `O nome pode ter até ${NAME_MAX} caracteres.` : undefined,
      category: category ? undefined : 'Escolha o tipo da ação.',
      expectation: expectation === null ? 'Escolha uma nota.' : undefined,
      pleasure: alreadyDone && pleasure === null ? 'Escolha uma nota.' : undefined,
      achievement: alreadyDone && achievement === null ? 'Escolha uma nota.' : undefined,
      observation: observation.trim().length > OBSERVATION_MAX ? `A observação pode ter até ${OBSERVATION_MAX} caracteres.` : undefined,
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    const base = { actionDate, name: trimmed, category: category!, expectation: expectation! };
    onSubmit(
      alreadyDone
        ? { status: 'AVALIADA', ...base, pleasure: pleasure!, achievement: achievement!, observation: observation.trim() || undefined }
        : { status: 'PLANEJADA', ...base },
    );
  }

  const fieldError = (key: string) => errors[key] ?? apiError?.fields[key];
  const topError = apiError && !Object.keys(apiError.fields).length ? apiError.message : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {topError && <Alert tone="attention">{topError}</Alert>}

      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-medium">Esta ação</legend>
          <div role="group" className="grid grid-cols-2 gap-2 sm:flex">
            <Button type="button" variant={alreadyDone ? 'secondary' : 'primary'} aria-pressed={!alreadyDone} onClick={() => setAlreadyDone(false)}>
              Vou fazer
            </Button>
            <Button type="button" variant={alreadyDone ? 'primary' : 'secondary'} aria-pressed={alreadyDone} onClick={() => setAlreadyDone(true)}>
              Já fiz
            </Button>
          </div>
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 font-medium">Tipo</legend>
        {CATEGORIES.map((value) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-surface p-3">
            <input
              type="radio"
              name="category"
              value={value}
              checked={category === value}
              onChange={() => setCategory(value)}
              className="mt-1 size-4 accent-primary"
            />
            <span className="flex flex-col">
              <span className="font-medium">{CATEGORY_TEXT[value].label}</span>
              <span className="text-sm text-muted">{CATEGORY_TEXT[value].description}</span>
            </span>
          </label>
        ))}
        {fieldError('category') && <p className="text-sm text-accent-text">{fieldError('category')}</p>}
      </fieldset>

      <TextField
        label="O que você vai fazer?"
        // Exemplo do tipo escolhido (DEC-052): ajuda quem trava na hora de pensar.
        placeholder={category ? CATEGORY_TEXT[category].placeholder : 'Escolha o tipo para ver um exemplo'}
        hint={category ? CATEGORY_TEXT[category].examples : undefined}
        maxLength={NAME_MAX}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldError('name')}
      />

      <TextField
        label="Dia"
        hint={alreadyDone ? `Hoje ou até ${RECORD_BACK_DAYS} dias atrás.` : `Hoje ou até ${PLAN_AHEAD_DAYS} dias à frente.`}
        type="date"
        value={actionDate}
        onChange={(e) => setActionDate(e.target.value)}
        error={fieldError('actionDate')}
      />

      <ScoreField
        label={SCORE_TEXT.expectation.label}
        hint="Antes de fazer: o quanto você espera gostar."
        minLabel={SCORE_TEXT.expectation.min}
        maxLabel={SCORE_TEXT.expectation.max}
        value={expectation}
        onChange={setExpectation}
        error={fieldError('expectation')}
      />

      {alreadyDone && (
        <>
          <ScoreField
            label={SCORE_TEXT.pleasure.label}
            minLabel={SCORE_TEXT.pleasure.min}
            maxLabel={SCORE_TEXT.pleasure.max}
            value={pleasure}
            onChange={setPleasure}
            error={fieldError('pleasure')}
          />
          <ScoreField
            label={SCORE_TEXT.achievement.label}
            minLabel={SCORE_TEXT.achievement.min}
            maxLabel={SCORE_TEXT.achievement.max}
            value={achievement}
            onChange={setAchievement}
            error={fieldError('achievement')}
          />
          <TextAreaField
            label="Observação (opcional)"
            rows={3}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            error={fieldError('observation')}
          />
        </>
      )}

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
