import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { DictationHint } from '../../components/ui/dictation-hint';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { isValidDateOnly, nowTimeInAppZone, todayInAppZone } from '../activities/week';
import { useAccessibility } from '../profile/use-profile';
import { ANSWER_MAX } from './plan-labels';
import type { PlanEntryInput } from './plans-api';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
type Errors = Partial<Record<string, string>>;

type PlanEntryFormProps = {
  // As perguntas do plano (registro novo) ou a cópia do registro (edição).
  questions: string[];
  initial?: { entryDate: string; entryTime: string | null; answers: string[] };
  initialDate: string;
  submitLabel: string;
  pending: boolean;
  // Erro da API: texto geral e erros por campo (VALIDATION_ERROR).
  apiError: { message: string; fields: Record<string, string> } | null;
  cancelTo: string;
  onSubmit: (input: PlanEntryInput) => void;
};

// Registro de um plano (DEC-095): o dia, a hora opcional e uma resposta por pergunta. As respostas
// são opcionais, mas pelo menos uma precisa de texto. A validação aqui só avisa antes; quem decide
// é a API. Com "Uma coisa por vez" (DEC-076), o dia e cada pergunta ficam num passo.
export function PlanEntryForm({
  questions,
  initial,
  initialDate,
  submitLabel,
  pending,
  apiError,
  cancelTo,
  onSubmit,
}: PlanEntryFormProps) {
  const { oneThingAtATime, directLanguage } = useAccessibility();
  const [step, setStep] = useState(0);
  const [date, setDate] = useState(initial?.entryDate ?? initialDate);
  const [time, setTime] = useState(initial?.entryTime ?? '');
  const [answers, setAnswers] = useState<string[]>(() => questions.map((_, index) => initial?.answers[index] ?? ''));
  const [errors, setErrors] = useState<Errors>({});
  const lastStep = questions.length;

  const emptyAnswers = directLanguage
    ? 'Escreva a resposta de pelo menos uma pergunta.'
    : 'Responda pelo menos uma pergunta.';

  function validateMoment(): Errors {
    const next: Errors = {};
    const today = todayInAppZone();
    if (!isValidDateOnly(date)) next.entryDate = 'Escolha uma data.';
    else if (date > today)
      next.entryDate = directLanguage
        ? 'Esse dia é no futuro. Escolha hoje ou um dia anterior.'
        : 'Esse dia ainda não chegou. Escolha hoje ou um dia anterior.';
    if (time && !TIME.test(time)) next.entryTime = 'Escolha uma hora válida, ou deixe em branco.';
    else if (time && date === today && time > nowTimeInAppZone())
      next.entryTime = directLanguage
        ? 'Essa hora é no futuro. Escolha uma hora que já passou, ou deixe em branco.'
        : 'Essa hora ainda não chegou. Escolha uma hora que já passou, ou deixe em branco.';
    return next;
  }

  function validateAnswers(): Errors {
    const next: Errors = {};
    answers.forEach((answer, index) => {
      if (answer.trim().length > ANSWER_MAX) next[`answer-${index}`] = `Cada resposta pode ter até ${ANSWER_MAX} caracteres.`;
    });
    if (answers.every((answer) => !answer.trim())) next.answers = emptyAnswers;
    return next;
  }

  function handleNext() {
    const stepErrors = step === 0 ? validateMoment() : {};
    const answer = step > 0 ? answers[step - 1]!.trim() : '';
    if (step > 0 && answer.length > ANSWER_MAX) {
      stepErrors[`answer-${step - 1}`] = `Cada resposta pode ter até ${ANSWER_MAX} caracteres.`;
    }
    setErrors(stepErrors);
    if (Object.values(stepErrors).some(Boolean)) return;
    setStep((current) => Math.min(current + 1, lastStep));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (oneThingAtATime && step < lastStep) {
      handleNext();
      return;
    }
    const momentErrors = validateMoment();
    const next = { ...momentErrors, ...validateAnswers() };
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      if (oneThingAtATime && Object.values(momentErrors).some(Boolean)) setStep(0);
      return;
    }
    onSubmit({ entryDate: date, entryTime: time || null, answers: answers.map((answer) => answer.trim()) });
  }

  const fieldError = (key: string) => errors[key] ?? apiError?.fields[key];
  const showStep = (index: number) => !oneThingAtATime || step === index;
  const isLastStep = !oneThingAtATime || step === lastStep;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}
      {(errors.answers ?? apiError?.fields.answers) && (
        <Alert tone="attention">{errors.answers ?? apiError?.fields.answers}</Alert>
      )}
      <DictationHint />

      {oneThingAtATime && (
        <p role="status" className="text-sm font-medium text-muted">
          Passo {step + 1} de {lastStep + 1}
        </p>
      )}

      {showStep(0) && (
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-2 font-semibold">Quando aconteceu?</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Dia"
              type="date"
              value={date}
              max={todayInAppZone()}
              onChange={(e) => setDate(e.target.value)}
              error={fieldError('entryDate')}
            />
            <TextField
              label="Hora (opcional)"
              hint="Pode deixar em branco se não lembrar."
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              error={fieldError('entryTime')}
            />
          </div>
        </fieldset>
      )}

      {(!oneThingAtATime || step === 1) && (
        <p className="text-muted">Responda o que conseguir. Pode deixar alguma pergunta em branco.</p>
      )}

      {questions.map((question, index) =>
        showStep(index + 1) ? (
          <TextAreaField
            key={index}
            label={question}
            value={answers[index]}
            limit={ANSWER_MAX}
            onChange={(e) =>
              setAnswers((current) => current.map((answer, i) => (i === index ? e.target.value : answer)))
            }
            error={fieldError(`answer-${index}`)}
          />
        ) : null,
      )}

      <div className="flex flex-wrap gap-3">
        {isLastStep ? (
          <Button key="submit" type="submit" disabled={pending}>
            {pending ? 'Salvando…' : submitLabel}
          </Button>
        ) : (
          <Button key="next" type="button" onClick={handleNext}>
            Próximo ›
          </Button>
        )}
        {oneThingAtATime && step > 0 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setErrors({});
              setStep((current) => Math.max(current - 1, 0));
            }}
          >
            ‹ Anterior
          </Button>
        )}
        <Link to={cancelTo} className={buttonClasses('secondary')}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
