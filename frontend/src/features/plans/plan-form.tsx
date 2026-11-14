import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { buttonClasses } from '../../components/ui/button-styles';
import { Dialog, DialogFooter } from '../../components/ui/dialog';
import { TextField } from '../../components/ui/text-field';
import { useAccessibility } from '../profile/use-profile';
import { QUESTION_MAX, QUESTIONS_MAX, TEMPLATE_QUESTIONS, TITLE_MAX } from './plan-labels';
import type { Plan, PlanInput } from './plans-api';

type Errors = Partial<Record<string, string>>;

type PlanFormProps = {
  initial?: Plan;
  submitLabel: string;
  pending: boolean;
  // Erro da API: texto geral e erros por campo (VALIDATION_ERROR).
  apiError: { message: string; fields: Record<string, string> } | null;
  cancelTo?: string;
  onCancel?: () => void;
  onSubmit: (input: PlanInput) => void;
};

// Criar ou editar um plano (DEC-095): o nome diz quando registrar, e as perguntas são livres, de 1
// a 10. O modelo das 6 perguntas entra por um botão, e não já preenchido (escolha do usuário).
export function PlanForm({ initial, submitLabel, pending, apiError, cancelTo, onCancel, onSubmit }: PlanFormProps) {
  const { directLanguage } = useAccessibility();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [questions, setQuestions] = useState<string[]>(initial?.questions ?? ['']);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmTemplate, setConfirmTemplate] = useState(false);
  // Pergunta que deve receber o foco depois de adicionar ou remover (o botão clicado pode sumir).
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    listRef.current?.querySelectorAll('input')[focusIndex]?.focus();
  }, [focusIndex, questions.length]);

  function validate(): Errors {
    const next: Errors = {};
    const trimmed = title.trim();
    if (!trimmed) next.title = 'Dê um nome ao plano.';
    else if (trimmed.length > TITLE_MAX) next.title = `O nome pode ter até ${TITLE_MAX} caracteres.`;
    questions.forEach((question, index) => {
      const value = question.trim();
      if (!value) next[`question-${index}`] = 'Escreva a pergunta ou remova este espaço.';
      else if (value.length > QUESTION_MAX) next[`question-${index}`] = `Cada pergunta pode ter até ${QUESTION_MAX} caracteres.`;
    });
    return next;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onSubmit({ title: title.trim(), questions: questions.map((question) => question.trim()) });
  }

  function applyTemplate() {
    setQuestions([...TEMPLATE_QUESTIONS]);
    setErrors({});
    setConfirmTemplate(false);
    setFocusIndex(0);
  }

  function addQuestion() {
    setQuestions((current) => [...current, '']);
    setFocusIndex(questions.length);
  }

  function removeQuestion(index: number) {
    setQuestions((current) => current.filter((_, i) => i !== index));
    setErrors({});
    setFocusIndex(Math.max(index - 1, 0));
  }

  const hasWritten = questions.some((question) => question.trim());
  const fieldError = (key: string) => errors[key] ?? apiError?.fields[key];
  const actions = (
    <>
      <Button type="submit" disabled={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </Button>
      {onCancel ? (
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      ) : (
        <Link to={cancelTo ?? '/planos'} className={buttonClasses('secondary')}>
          Cancelar
        </Link>
      )}
    </>
  );

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}

      <TextField
        label="Nome do plano"
        hint={`Diga quando registrar. Ex.: Quando surgir vontade de rolar o celular sem parar. ${
          directLanguage ? 'O nome aparece na tela do app.' : 'Use um nome que você se sinta à vontade de ver na tela.'
        }`}
        value={title}
        maxLength={TITLE_MAX}
        onChange={(e) => setTitle(e.target.value)}
        error={fieldError('title')}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 font-semibold">Perguntas</legend>
        {initial?.hasEntries && (
          <Alert>
            As perguntas novas valem para os próximos registros. Os registros que você já fez continuam com as perguntas
            de quando foram feitos.
          </Alert>
        )}
        <div className="flex flex-col gap-2 rounded-md bg-bg p-3">
          <p className="text-sm text-muted">
            O modelo traz perguntas sobre o que aconteceu antes, o que você sentiu, o que procurava, o que imaginou que
            receberia, o que fez e como ficou depois. Dá para mudar tudo.
          </p>
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => (hasWritten ? setConfirmTemplate(true) : applyTemplate())}
          >
            Usar o modelo de 6 perguntas
          </Button>
        </div>

        <ol ref={listRef} className="flex flex-col gap-4">
          {questions.map((question, index) => (
            <li key={index} className="flex flex-col gap-1">
              <TextField
                label={`Pergunta ${index + 1}`}
                value={question}
                maxLength={QUESTION_MAX}
                onChange={(e) =>
                  setQuestions((current) => current.map((item, i) => (i === index ? e.target.value : item)))
                }
                error={fieldError(`question-${index}`)}
              />
              {questions.length > 1 && (
                <Button variant="ghost" className="self-start px-3" onClick={() => removeQuestion(index)}>
                  Remover<span className="sr-only"> a pergunta {index + 1}</span>
                </Button>
              )}
            </li>
          ))}
        </ol>

        {fieldError('questions') && <Alert tone="attention">{fieldError('questions')}</Alert>}

        {questions.length < QUESTIONS_MAX ? (
          <Button variant="secondary" className="self-start" onClick={addQuestion}>
            Adicionar pergunta
          </Button>
        ) : null}
        <p className="text-sm text-muted">De 1 a {QUESTIONS_MAX} perguntas.</p>
      </fieldset>

      {onCancel ? (
        <DialogFooter>{actions}</DialogFooter>
      ) : (
        <div className="flex flex-wrap gap-3">{actions}</div>
      )}

      {confirmTemplate && (
        <Dialog
          title="Trocar pelas perguntas do modelo?"
          description="As perguntas que você escreveu saem, e entram as 6 do modelo."
          onClose={() => setConfirmTemplate(false)}
        >
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmTemplate(false)}>
              Cancelar
            </Button>
            <Button onClick={applyTemplate}>Trocar</Button>
          </DialogFooter>
        </Dialog>
      )}
    </form>
  );
}
