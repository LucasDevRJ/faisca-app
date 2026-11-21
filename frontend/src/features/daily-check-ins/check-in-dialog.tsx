import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { FieldError } from '../../components/ui/field-error';
import { choiceCardClasses } from '../../components/ui/field-styles';
import { ScoreField } from '../../components/ui/score-field';
import { TextField } from '../../components/ui/text-field';
import { formatDayHeading } from '../activities/week';
import { getApiError } from '../auth/auth-api';
import {
  formatSleep,
  MEDICATION_OPTIONS,
  MOOD_WORD_MAX,
  SCORE_TEXT,
  sleepMinutesBetween,
} from './check-in-labels';
import type { CheckIn, CheckInInput, MedicationTaken } from './daily-check-ins-api';
import { useDeleteCheckIn, useSaveCheckIn } from './use-daily-check-ins';

type Errors = Partial<Record<'times' | 'moodWord' | 'form', string>>;

// O registro de um dia (DEC-108): tudo opcional, num formulário curto. A pergunta do remédio só
// aparece para quem a ligou em Conta (DEC-107).
export function CheckInDialog({
  date,
  checkIn,
  tracksMedication,
  onClose,
  onDone,
}: {
  date: string;
  checkIn: CheckIn | null;
  tracksMedication: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [bedTime, setBedTime] = useState(checkIn?.bedTime ?? '');
  const [wakeTime, setWakeTime] = useState(checkIn?.wakeTime ?? '');
  const [sleepQuality, setSleepQuality] = useState<number | null>(checkIn?.sleepQuality ?? null);
  const [mood, setMood] = useState<number | null>(checkIn?.mood ?? null);
  const [moodWord, setMoodWord] = useState(checkIn?.moodWord ?? '');
  const [medication, setMedication] = useState<MedicationTaken | null>(checkIn?.medication ?? null);
  const [errors, setErrors] = useState<Errors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const save = useSaveCheckIn();
  const remove = useDeleteCheckIn();

  const minutes = bedTime && wakeTime ? sleepMinutesBetween(bedTime, wakeTime) : null;
  const title = `Sono e humor de ${formatDayHeading(date).toLowerCase()}`;

  function validate(): Errors {
    const found: Errors = {};
    if (Boolean(bedTime) !== Boolean(wakeTime)) found.times = 'Informe a hora em que deitou e a hora em que acordou.';
    else if (bedTime && bedTime === wakeTime) found.times = 'A hora de deitar e a de acordar são iguais.';
    if (moodWord.trim().length > MOOD_WORD_MAX) {
      found.moodWord = `A palavra ou frase do dia pode ter até ${MOOD_WORD_MAX} caracteres.`;
    }
    const answered = bedTime || sleepQuality !== null || mood !== null || moodWord.trim() || medication;
    if (!answered && !found.times) found.form = 'Preencha ao menos uma resposta.';
    return found;
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const input: CheckInInput = {
      bedTime: bedTime || null,
      wakeTime: wakeTime || null,
      sleepQuality,
      mood,
      moodWord: moodWord.trim() || null,
      // Desligada a pergunta, o que já estava guardado continua (só a pergunta some).
      medication: tracksMedication ? medication : (checkIn?.medication ?? null),
    };
    save.mutate({ date, input }, { onSuccess: () => onDone('Registro do dia salvo.') });
  }

  if (confirmDelete) {
    return (
      <Dialog title="Apagar o registro deste dia?" onClose={onClose}>
        <DialogForm
          error={remove.error ? getApiError(remove.error).message : null}
          onSubmit={(event) => {
            event.preventDefault();
            remove.mutate(date, { onSuccess: () => onDone('Registro do dia apagado.') });
          }}
        >
          <p>O sono, o humor e o remédio deste dia saem do Faísca. Não dá para desfazer.</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Voltar
            </Button>
            <Button type="submit" disabled={remove.isPending}>
              {remove.isPending ? 'Apagando…' : 'Apagar'}
            </Button>
          </DialogFooter>
        </DialogForm>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <DialogForm error={save.error ? getApiError(save.error).message : null} onSubmit={submit}>
        <p className="text-muted">Tudo bem preencher só uma parte.</p>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Sono</legend>
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Que horas você deitou?"
              type="time"
              value={bedTime}
              onChange={(event) => setBedTime(event.target.value)}
              aria-invalid={errors.times ? true : undefined}
              // O erro dos horários fica embaixo dos dois campos: o leitor de tela lê junto (revisor-telas).
              aria-describedby={errors.times ? 'check-in-times-error' : undefined}
            />
            <TextField
              label="Que horas acordou?"
              type="time"
              value={wakeTime}
              onChange={(event) => setWakeTime(event.target.value)}
              aria-invalid={errors.times ? true : undefined}
              // O erro dos horários fica embaixo dos dois campos: o leitor de tela lê junto (revisor-telas).
              aria-describedby={errors.times ? 'check-in-times-error' : undefined}
            />
          </div>
          <p role="status" className="text-sm text-muted">
            {minutes !== null ? `Dá ${formatSleep(minutes)} de sono.` : ''}
          </p>
          {errors.times && <FieldError id="check-in-times-error">{errors.times}</FieldError>}
          <ClearableScore
            text={SCORE_TEXT.sleepQuality}
            value={sleepQuality}
            onChange={setSleepQuality}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Humor</legend>
          <ClearableScore text={SCORE_TEXT.mood} value={mood} onChange={setMood} />
          <TextField
            label="Uma palavra ou frase para o dia (opcional)"
            placeholder="Ex.: cansado, tranquilo"
            hint={`Até ${MOOD_WORD_MAX} caracteres.`}
            value={moodWord}
            onChange={(event) => setMoodWord(event.target.value)}
            error={errors.moodWord}
          />
        </fieldset>

        {tracksMedication && (
          <fieldset className="flex flex-col gap-2" aria-describedby="check-in-medication-hint">
            <legend className="mb-1 font-semibold">Tomou o remédio como combinado?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MEDICATION_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-11 items-center gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
                >
                  <input
                    type="radio"
                    name="check-in-medication"
                    checked={medication === option.value}
                    onChange={() => setMedication(option.value)}
                  />
                  <span className="font-medium">{option.label}</span>
                </label>
              ))}
            </div>
            <p id="check-in-medication-hint" className="text-sm text-muted italic">
              Mudanças no remédio, só com quem receitou.
            </p>
            {medication && (
              <Button variant="ghost" className="self-start px-0 underline" onClick={() => setMedication(null)}>
                Deixar o remédio em branco
              </Button>
            )}
          </fieldset>
        )}

        {/* Sem campo a apontar: o aviso é anunciado assim que aparece. */}
        <div role="alert" className="empty:hidden">
          {errors.form && <FieldError id="check-in-form-error">{errors.form}</FieldError>}
        </div>

        {checkIn && (
          <Button variant="ghost" className="self-start px-0 underline" onClick={() => setConfirmDelete(true)}>
            Apagar o registro deste dia
          </Button>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Dialog>
  );
}

// Nota de 0 a 10 que pode voltar a ficar em branco: preencher só uma parte é normal.
function ClearableScore({
  text,
  value,
  onChange,
}: {
  text: { label: string; short: string; min: string; max: string };
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ScoreField label={text.label} value={value} onChange={onChange} minLabel={text.min} maxLabel={text.max} />
      {value !== null && (
        <Button variant="ghost" className="self-start px-0 underline" onClick={() => onChange(null)}>
          Deixar a nota do {text.short} em branco
        </Button>
      )}
    </div>
  );
}
