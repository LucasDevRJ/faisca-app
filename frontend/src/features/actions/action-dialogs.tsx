import { useState, type FormEvent } from 'react';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { SCORE_TEXT } from './action-labels';
import type { Action } from './actions-api';
import { useDeleteAction, useEvaluateAction, useMarkActionNotDone } from './use-actions';

// Diálogos da Ação (DEC-052): contar como foi, "não deu desta vez" e excluir a planejada.

const OBSERVATION_MAX = 1000;

function observationError(value: string) {
  return value.trim().length > OBSERVATION_MAX ? `A observação pode ter até ${OBSERVATION_MAX} caracteres.` : undefined;
}

function optional(value: string) {
  return value.trim() || undefined;
}

type Done = (message?: string) => void;

export function EvaluateActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: Done }) {
  const [pleasure, setPleasure] = useState<number | null>(null);
  const [achievement, setAchievement] = useState<number | null>(null);
  const [observation, setObservation] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const evaluate = useEvaluateAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      pleasure: pleasure === null ? 'Escolha uma nota.' : undefined,
      achievement: achievement === null ? 'Escolha uma nota.' : undefined,
      observation: observationError(observation),
    };
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    evaluate.mutate(
      { id: action.id, input: { pleasure: pleasure!, achievement: achievement!, observation: optional(observation) } },
      { onSuccess: () => onDone() },
    );
  }

  return (
    <Dialog
      title="Conta como foi?"
      description={`${action.name} · você esperava ${action.expectation} de 10`}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={evaluate.error ? getApiError(evaluate.error).message : null}>
        <ScoreField
          label={SCORE_TEXT.pleasure.label}
          minLabel={SCORE_TEXT.pleasure.min}
          maxLabel={SCORE_TEXT.pleasure.max}
          value={pleasure}
          onChange={setPleasure}
          error={errors.pleasure}
        />
        <ScoreField
          label={SCORE_TEXT.achievement.label}
          minLabel={SCORE_TEXT.achievement.min}
          maxLabel={SCORE_TEXT.achievement.max}
          value={achievement}
          onChange={setAchievement}
          error={errors.achievement}
        />
        <TextAreaField
          label="Observação (opcional)"
          rows={3}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          error={errors.observation}
        />
        <DialogActions submitLabel="Salvar" pending={evaluate.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function NotDoneActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: Done }) {
  const [observation, setObservation] = useState('');
  const [error, setError] = useState<string>();
  const notDone = useMarkActionNotDone();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = observationError(observation);
    setError(invalid);
    if (invalid) return;
    notDone.mutate({ id: action.id, observation: optional(observation) }, { onSuccess: () => onDone() });
  }

  return (
    <Dialog
      title="Tudo bem, não deu desta vez"
      description="A ação continua registrada. Quer contar o que aconteceu?"
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={notDone.error ? getApiError(notDone.error).message : null}>
        <TextAreaField
          label="Observação (opcional)"
          rows={3}
          value={observation}
          onChange={(e) => setObservation(e.target.value)}
          error={error}
        />
        <DialogActions submitLabel="Salvar" pending={notDone.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function DeleteActionDialog({ action, onClose, onDone }: { action: Action; onClose: () => void; onDone: Done }) {
  const remove = useDeleteAction();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    remove.mutate(action.id, { onSuccess: () => onDone('Ação excluída.') });
  }

  return (
    <Dialog title="Excluir esta ação?" description={action.name} onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={remove.error ? getApiError(remove.error).message : null}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
