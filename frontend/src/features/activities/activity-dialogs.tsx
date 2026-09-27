import { useState, type FormEvent, type ReactNode } from 'react';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import type { Activity } from './activities-api';
import { NAME_MAX, OBSERVATION_MAX, SCORE_TEXT } from './activity-labels';
import {
  activityErrorMessage,
  PartialSaveError,
  useCompleteActivity,
  useCreateActivity,
  useDeleteActivity,
  useMarkNotDone,
  useStartActivity,
  useUpdateActivity,
  type CreateRequest,
} from './use-activities';
import { isValidDateOnly, todayInAppZone } from './week';

// Ao terminar, o dialog fecha. `notice` vem quando um passo duplo gravou só a primeira parte
// (DEC-029): o aviso aparece na tela da semana, e o formulário não pode ser reenviado.
export type DialogDone = (notice?: string) => void;

type Errors = Partial<Record<string, string>>;

// Validação no navegador, com as regras da DEC-028. Serve para avisar antes; quem decide é a API.
function validateName(name: string) {
  const value = name.trim();
  if (!value) return 'Dê um nome para a atividade.';
  if (value.length > NAME_MAX) return `O nome pode ter até ${NAME_MAX} caracteres.`;
  return undefined;
}

function validateDate(date: string, { notFuture }: { notFuture: boolean }) {
  if (!isValidDateOnly(date)) return 'Escolha uma data.';
  if (notFuture && date > todayInAppZone()) return 'Esse dia ainda não chegou. Escolha hoje ou um dia anterior.';
  return undefined;
}

function validateObservation(observation: string) {
  return observation.trim().length > OBSERVATION_MAX
    ? `A observação pode ter até ${OBSERVATION_MAX} caracteres.`
    : undefined;
}

const required = (value: number | null) => (value === null ? 'Escolha um número de 0 a 10.' : undefined);

const hasErrors = (errors: Errors) => Object.values(errors).some(Boolean);

const optionalText = (value: string) => value.trim() || undefined;

// Erro da API: passo parcial fecha o dialog; os outros ficam no formulário.
function useSubmitError(onDone: DialogDone) {
  const [apiErrors, setApiErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);

  function handle(error: unknown) {
    if (error instanceof PartialSaveError) {
      onDone(error.message);
      return;
    }
    setMessage(activityErrorMessage(error));
    setApiErrors(getApiError(error).fields);
  }

  function reset() {
    setMessage(null);
    setApiErrors({});
  }

  return { apiErrors, message, handle, reset };
}

function DialogActions({
  submitLabel,
  pending,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </Button>
    </DialogFooter>
  );
}

function DialogForm({
  onSubmit,
  error,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string | null;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {error && <Alert tone="attention">{error}</Alert>}
      {children}
    </form>
  );
}

type CreateMode = CreateRequest['status'];

const CREATE_MODES: { value: CreateMode; label: string; hint: string }[] = [
  { value: 'PLANEJADA', label: 'Vou fazer', hint: 'Só planejar, por enquanto.' },
  { value: 'PENDENTE', label: 'Vou fazer, e já sei a vontade', hint: 'Anote quanta vontade você tem agora.' },
  { value: 'CONCLUIDA', label: 'Já fiz', hint: 'Conte como foi.' },
  { value: 'NAO_REALIZADA', label: 'Não aconteceu', hint: 'Tudo bem, dá para registrar também.' },
];

export function CreateActivityDialog({
  initialDate,
  onClose,
  onDone,
}: {
  initialDate: string;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const [name, setName] = useState('');
  const [date, setDate] = useState(initialDate);
  const [mode, setMode] = useState<CreateMode>('PLANEJADA');
  const [wantBefore, setWantBefore] = useState<number | null>(null);
  const [pleasure, setPleasure] = useState<number | null>(null);
  const [achievement, setAchievement] = useState<number | null>(null);
  const [observation, setObservation] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const create = useCreateActivity();
  const submitError = useSubmitError(onDone);

  const asksWant = mode === 'PENDENTE' || mode === 'CONCLUIDA';
  const asksHowItWent = mode === 'CONCLUIDA';
  const asksObservation = mode === 'CONCLUIDA' || mode === 'NAO_REALIZADA';
  const pastOnly = mode === 'CONCLUIDA' || mode === 'NAO_REALIZADA';

  function buildRequest(): CreateRequest {
    const base = { name: name.trim(), activityDate: date };
    switch (mode) {
      case 'PLANEJADA':
        return { ...base, status: mode };
      case 'PENDENTE':
        return { ...base, status: mode, wantBefore: wantBefore! };
      case 'CONCLUIDA':
        return {
          ...base,
          status: mode,
          wantBefore: wantBefore!,
          pleasure: pleasure!,
          achievement: achievement!,
          observation: optionalText(observation),
        };
      case 'NAO_REALIZADA':
        return { ...base, status: mode, observation: optionalText(observation) };
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {
      name: validateName(name),
      activityDate: validateDate(date, { notFuture: pastOnly }),
      wantBefore: asksWant ? required(wantBefore) : undefined,
      pleasure: asksHowItWent ? required(pleasure) : undefined,
      achievement: asksHowItWent ? required(achievement) : undefined,
      observation: asksObservation ? validateObservation(observation) : undefined,
    };
    setErrors(next);
    submitError.reset();
    if (hasErrors(next)) return;

    create.mutate(buildRequest(), { onSuccess: () => onDone(), onError: submitError.handle });
  }

  const fieldError = (key: string) => errors[key] ?? submitError.apiErrors[key];

  return (
    <Dialog title="Nova atividade" onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        <TextField
          label="O que você vai fazer (ou fez)?"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          error={fieldError('name')}
        />
        <TextField
          label="Dia"
          type="date"
          value={date}
          max={pastOnly ? todayInAppZone() : undefined}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError('activityDate')}
        />

        <fieldset className="flex flex-col gap-1.5 sm:gap-2">
          <legend className="mb-2 font-medium">Como você quer registrar?</legend>
          {CREATE_MODES.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2 has-checked:border-primary has-checked:bg-bg sm:px-4 sm:py-3"
            >
              <input
                type="radio"
                name="mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
                className="mt-1 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-sm leading-snug text-muted">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {asksWant && (
          <ScoreField
            label={SCORE_TEXT.wantBefore.label}
            minLabel={SCORE_TEXT.wantBefore.min}
            maxLabel={SCORE_TEXT.wantBefore.max}
            value={wantBefore}
            onChange={setWantBefore}
            error={fieldError('wantBefore')}
          />
        )}
        {asksHowItWent && (
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
          </>
        )}
        {asksObservation && (
          <TextAreaField
            label="Quer anotar algo? (opcional)"
            value={observation}
            maxLength={OBSERVATION_MAX}
            onChange={(e) => setObservation(e.target.value)}
            error={fieldError('observation')}
          />
        )}

        <DialogActions submitLabel="Salvar" pending={create.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function EditActivityDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const [name, setName] = useState(activity.name);
  const [date, setDate] = useState(activity.activityDate);
  const [wantBefore, setWantBefore] = useState<number | null>(activity.wantBefore);
  const [errors, setErrors] = useState<Errors>({});
  const update = useUpdateActivity();
  const submitError = useSubmitError(onDone);
  const isPending = activity.status === 'PENDENTE';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {
      name: validateName(name),
      activityDate: validateDate(date, { notFuture: false }),
      wantBefore: isPending ? required(wantBefore) : undefined,
    };
    setErrors(next);
    submitError.reset();
    if (hasErrors(next)) return;

    // Só o que mudou vai para a API.
    const changes = {
      name: name.trim() !== activity.name ? name.trim() : undefined,
      activityDate: date !== activity.activityDate ? date : undefined,
      wantBefore: isPending && wantBefore !== activity.wantBefore ? wantBefore! : undefined,
    };
    if (Object.values(changes).every((value) => value === undefined)) {
      onClose();
      return;
    }
    update.mutate({ id: activity.id, ...changes }, { onSuccess: () => onDone(), onError: submitError.handle });
  }

  const fieldError = (key: string) => errors[key] ?? submitError.apiErrors[key];

  return (
    <Dialog title="Editar atividade" onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        <TextField
          label="Nome"
          value={name}
          maxLength={NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          error={fieldError('name')}
        />
        <TextField
          label="Dia"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={fieldError('activityDate')}
        />
        {isPending && (
          <ScoreField
            label={SCORE_TEXT.wantBefore.label}
            minLabel={SCORE_TEXT.wantBefore.min}
            maxLabel={SCORE_TEXT.wantBefore.max}
            value={wantBefore}
            onChange={setWantBefore}
            error={fieldError('wantBefore')}
          />
        )}
        <DialogActions submitLabel="Salvar" pending={update.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function StartActivityDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const [wantBefore, setWantBefore] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const start = useStartActivity();
  const submitError = useSubmitError(onDone);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(required(wantBefore));
    submitError.reset();
    if (wantBefore === null) return;
    start.mutate({ id: activity.id, wantBefore }, { onSuccess: () => onDone(), onError: submitError.handle });
  }

  return (
    <Dialog title="Quanta vontade você tem agora?" description={activity.name} onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        <ScoreField
          label={SCORE_TEXT.wantBefore.label}
          minLabel={SCORE_TEXT.wantBefore.min}
          maxLabel={SCORE_TEXT.wantBefore.max}
          value={wantBefore}
          onChange={setWantBefore}
          error={error}
        />
        <DialogActions submitLabel="Salvar" pending={start.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function CompleteActivityDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const [wantBefore, setWantBefore] = useState<number | null>(null);
  const [pleasure, setPleasure] = useState<number | null>(null);
  const [achievement, setAchievement] = useState<number | null>(null);
  const [observation, setObservation] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const complete = useCompleteActivity();
  const submitError = useSubmitError(onDone);
  // Uma PLANEJADA ainda não tem a vontade: ela é pedida aqui e gravada antes (DEC-029).
  const asksWant = activity.status === 'PLANEJADA';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {
      wantBefore: asksWant ? required(wantBefore) : undefined,
      pleasure: required(pleasure),
      achievement: required(achievement),
      observation: validateObservation(observation),
    };
    setErrors(next);
    submitError.reset();
    if (hasErrors(next)) return;

    complete.mutate(
      {
        activity,
        wantBefore: asksWant ? wantBefore! : undefined,
        pleasure: pleasure!,
        achievement: achievement!,
        observation: optionalText(observation),
      },
      { onSuccess: () => onDone(), onError: submitError.handle },
    );
  }

  const fieldError = (key: string) => errors[key] ?? submitError.apiErrors[key];

  return (
    <Dialog title="Conta como foi?" description={activity.name} onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        {asksWant && (
          <ScoreField
            label="Vontade antes de fazer"
            minLabel={SCORE_TEXT.wantBefore.min}
            maxLabel={SCORE_TEXT.wantBefore.max}
            value={wantBefore}
            onChange={setWantBefore}
            error={fieldError('wantBefore')}
          />
        )}
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
          label="Quer anotar algo? (opcional)"
          value={observation}
          maxLength={OBSERVATION_MAX}
          onChange={(e) => setObservation(e.target.value)}
          error={fieldError('observation')}
        />
        <DialogActions submitLabel="Salvar" pending={complete.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function NotDoneDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const [observation, setObservation] = useState('');
  const [error, setError] = useState<string>();
  const notDone = useMarkNotDone();
  const submitError = useSubmitError(onDone);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateObservation(observation);
    setError(invalid);
    submitError.reset();
    if (invalid) return;
    notDone.mutate(
      { id: activity.id, observation: optionalText(observation) },
      { onSuccess: () => onDone(), onError: submitError.handle },
    );
  }

  return (
    <Dialog title="Tudo bem, quer contar o que aconteceu?" description={activity.name} onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        <TextAreaField
          label="O que aconteceu? (opcional)"
          value={observation}
          maxLength={OBSERVATION_MAX}
          onChange={(e) => setObservation(e.target.value)}
          error={error ?? submitError.apiErrors.observation}
        />
        <DialogActions submitLabel="Salvar" pending={notDone.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function DeleteActivityDialog({
  activity,
  onClose,
  onDone,
}: {
  activity: Activity;
  onClose: () => void;
  onDone: DialogDone;
}) {
  const remove = useDeleteActivity();
  const submitError = useSubmitError(onDone);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitError.reset();
    remove.mutate(activity.id, { onSuccess: () => onDone(), onError: submitError.handle });
  }

  return (
    <Dialog
      title={`Excluir “${activity.name}”?`}
      description="A atividade some da sua semana, e não dá para desfazer."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={submitError.message}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
