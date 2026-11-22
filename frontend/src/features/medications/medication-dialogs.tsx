import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogActions, DialogFooter, DialogForm } from '../../components/ui/dialog';
import { choiceCardClasses, fieldClasses } from '../../components/ui/field-styles';
import { ScoreField } from '../../components/ui/score-field';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { formatFullDate, todayInAppZone } from '../activities/week';
import { getApiError } from '../auth/auth-api';
import {
  CHANGE_NOTE_MAX,
  FIRST_DATE,
  INTENSITY_TEXT,
  MEDICATION_DOSE_MAX,
  MEDICATION_NAME_MAX,
  MEDICATION_SCHEDULE_MAX,
  PRESCRIBER_HINT,
  SAFETY_TEXT,
  SYMPTOM_DESCRIPTION_MAX,
  SYMPTOM_NOTE_MAX,
} from './medication-labels';
import type { ChangeKind, Medication, MedicationChange, Symptom } from './medications-api';
import {
  useAddChange,
  useCreateMedication,
  useCreateSymptom,
  useDeleteChange,
  useDeleteMedication,
  useDeleteSymptom,
  useDeleteSymptomCheck,
  useSaveSymptomCheck,
  useUpdateChange,
  useUpdateMedication,
  useUpdateSymptom,
} from './use-medications';

// As janelas de Remédios e o que sinto (DEC-115). Todo campo de data vai de 1950 até hoje, como a API.

type Done = (message: string) => void;

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted italic">{children}</p>;
}

// Texto curto de um campo: sem nada, o erro; passou do limite, o erro do limite.
function tooLong(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `Use até ${max} caracteres em ${label}.` : undefined;
}

function dateError(value: string, today: string): string | undefined {
  if (!value) return 'Informe a data.';
  if (value > today) return 'Essa data ainda não chegou.';
  if (value < FIRST_DATE) return 'Informe uma data a partir de 1950.';
  return undefined;
}

function DateField({
  label,
  value,
  onChange,
  error,
  min = FIRST_DATE,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  min?: string;
}) {
  return (
    <TextField
      label={label}
      type="date"
      min={min}
      max={todayInAppZone()}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
    />
  );
}

// Confirmação de apagar, com "Voltar".
function ConfirmDelete({
  title,
  text,
  pending,
  error,
  onBack,
  onClose,
  onConfirm,
}: {
  title: string;
  text: string;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose}>
      <DialogForm
        error={error}
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <p>{text}</p>
        <DialogFooter>
          <Button variant="secondary" onClick={onBack}>
            Voltar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? 'Apagando…' : 'Apagar'}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Dialog>
  );
}

// Anotar um remédio novo, ou editar o nome e o horário (a dose muda por uma mudança com data).
export function MedicationDialog({
  medication,
  onClose,
  onDone,
}: {
  medication?: Medication;
  onClose: () => void;
  onDone: Done;
}) {
  const today = todayInAppZone();
  const [name, setName] = useState(medication?.name ?? '');
  const [dose, setDose] = useState('');
  const [schedule, setSchedule] = useState(medication?.schedule ?? '');
  const [startedOn, setStartedOn] = useState(today);
  const [errors, setErrors] = useState<Partial<Record<'name' | 'dose' | 'schedule' | 'startedOn', string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateMedication();
  const update = useUpdateMedication();
  const remove = useDeleteMedication();
  const mutation = medication ? update : create;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      name: !name.trim() ? 'Informe o nome do remédio.' : tooLong(name, MEDICATION_NAME_MAX, 'o nome'),
      dose: medication ? undefined : tooLong(dose, MEDICATION_DOSE_MAX, 'a dose'),
      schedule: tooLong(schedule, MEDICATION_SCHEDULE_MAX, 'o horário'),
      startedOn: medication ? undefined : dateError(startedOn, today),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    if (medication) {
      update.mutate(
        { id: medication.id, input: { name: name.trim(), schedule: schedule.trim() || null } },
        { onSuccess: () => onDone('Remédio atualizado.') },
      );
    } else {
      create.mutate(
        { name: name.trim(), dose: dose.trim() || null, schedule: schedule.trim() || null, startedOn },
        { onSuccess: () => onDone('Remédio anotado.') },
      );
    }
  }

  if (medication && confirmDelete) {
    return (
      <ConfirmDelete
        title="Apagar este remédio?"
        text="O remédio e as mudanças saem do Faísca. O que você anotou que sentiu continua, só sem a ligação com ele. Não dá para desfazer."
        pending={remove.isPending}
        error={remove.error ? getApiError(remove.error).message : null}
        onBack={() => setConfirmDelete(false)}
        onClose={onClose}
        onConfirm={() => remove.mutate(medication.id, { onSuccess: () => onDone('Remédio apagado.') })}
      />
    );
  }

  return (
    <Dialog title={medication ? 'Editar remédio' : 'Anotar remédio'} onClose={onClose}>
      <DialogForm error={mutation.error ? getApiError(mutation.error).message : null} onSubmit={submit}>
        <TextField label="Nome do remédio" value={name} onChange={(event) => setName(event.target.value)} error={errors.name} />
        {!medication && (
          <TextField
            label="Dose (opcional)"
            placeholder="Ex.: 50 mg"
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            error={errors.dose}
          />
        )}
        <TextField
          label="Horário (opcional)"
          placeholder="Ex.: de manhã"
          value={schedule}
          onChange={(event) => setSchedule(event.target.value)}
          error={errors.schedule}
        />
        {!medication && <DateField label="Desde quando?" value={startedOn} onChange={setStartedOn} error={errors.startedOn} />}
        {medication && <Hint>Para mudar a dose, use “Registrar mudança”: assim a data fica anotada.</Hint>}
        <Hint>{PRESCRIBER_HINT}</Hint>
        {medication && (
          <Button variant="ghost" className="self-start px-0 underline" onClick={() => setConfirmDelete(true)}>
            Apagar este remédio
          </Button>
        )}
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

const CHANGE_OPTIONS: Record<'active' | 'stopped', { value: ChangeKind; label: string }[]> = {
  active: [
    { value: 'MUDOU_DOSE', label: 'Mudou a dose' },
    { value: 'PAROU', label: 'Parei' },
  ],
  stopped: [{ value: 'COMECOU', label: 'Voltei a tomar' }],
};

// Registrar uma mudança com data, ou editar uma já anotada (a data, a dose e a nota; o tipo não muda).
export function ChangeDialog({
  medication,
  change,
  onClose,
  onDone,
}: {
  medication: Medication;
  change?: MedicationChange;
  onClose: () => void;
  onDone: Done;
}) {
  const today = todayInAppZone();
  const options = CHANGE_OPTIONS[medication.active ? 'active' : 'stopped'];
  const [kind, setKind] = useState<ChangeKind>(change?.kind ?? options[0]!.value);
  const [changeDate, setChangeDate] = useState(change?.changeDate ?? today);
  const [dose, setDose] = useState(change?.dose ?? '');
  const [note, setNote] = useState(change?.note ?? '');
  const [errors, setErrors] = useState<Partial<Record<'changeDate' | 'dose' | 'note', string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const add = useAddChange();
  const update = useUpdateChange();
  const remove = useDeleteChange();
  const mutation = change ? update : add;
  const legendId = useId();
  const withDose = kind !== 'PAROU';
  const onlyChange = medication.changes.length === 1;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      changeDate: dateError(changeDate, today),
      dose:
        kind === 'MUDOU_DOSE' && !dose.trim()
          ? 'Informe a dose nova.'
          : withDose
            ? tooLong(dose, MEDICATION_DOSE_MAX, 'a dose')
            : undefined,
      note: tooLong(note, CHANGE_NOTE_MAX, 'a nota'),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const values = { changeDate, dose: withDose ? dose.trim() || null : null, note: note.trim() || null };
    if (change) {
      update.mutate(
        { id: medication.id, changeId: change.id, input: values },
        { onSuccess: () => onDone('Mudança atualizada.') },
      );
    } else {
      add.mutate({ id: medication.id, input: { kind, ...values } }, { onSuccess: () => onDone('Mudança anotada.') });
    }
  }

  if (change && confirmDelete) {
    return (
      <ConfirmDelete
        title="Apagar esta mudança?"
        text="A mudança sai da linha do tempo do remédio. Não dá para desfazer."
        pending={remove.isPending}
        error={remove.error ? getApiError(remove.error).message : null}
        onBack={() => setConfirmDelete(false)}
        onClose={onClose}
        onConfirm={() =>
          remove.mutate({ id: medication.id, changeId: change.id }, { onSuccess: () => onDone('Mudança apagada.') })
        }
      />
    );
  }

  return (
    <Dialog title={change ? 'Editar mudança' : 'Registrar mudança'} description={medication.name} onClose={onClose}>
      <DialogForm error={mutation.error ? getApiError(mutation.error).message : null} onSubmit={submit}>
        {!change && (
          <fieldset className="flex flex-col gap-2" aria-labelledby={legendId}>
            <legend id={legendId} className="mb-1 font-semibold">
              O que mudou?
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option) => (
                <label
                  key={option.value}
                  className={`flex min-h-11 items-center gap-3 p-3 has-focus-visible:outline-2 has-focus-visible:outline-primary ${choiceCardClasses}`}
                >
                  <input
                    type="radio"
                    name="change-kind"
                    checked={kind === option.value}
                    onChange={() => setKind(option.value)}
                  />
                  <span className="font-medium">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <DateField label="Quando?" value={changeDate} onChange={setChangeDate} error={errors.changeDate} />
        {withDose && (
          <TextField
            label={kind === 'MUDOU_DOSE' ? 'Dose nova' : 'Dose (opcional)'}
            placeholder="Ex.: 100 mg"
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            error={errors.dose}
          />
        )}
        <TextAreaField
          label="Nota (opcional)"
          hint="Quer anotar o motivo? Por exemplo, o que a médica disse."
          limit={CHANGE_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          error={errors.note}
        />
        <Hint>{PRESCRIBER_HINT}</Hint>
        {change && !onlyChange && (
          <Button variant="ghost" className="self-start px-0 underline" onClick={() => setConfirmDelete(true)}>
            Apagar esta mudança
          </Button>
        )}
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

// Nota de 0 a 10 que pode voltar a ficar em branco.
function OptionalIntensity({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <ScoreField
        label={INTENSITY_TEXT.label}
        value={value}
        onChange={onChange}
        minLabel={INTENSITY_TEXT.min}
        maxLabel={INTENSITY_TEXT.max}
      />
      {value !== null && (
        <Button variant="ghost" className="self-start px-0 underline" onClick={() => onChange(null)}>
          Deixar a intensidade em branco
        </Button>
      )}
    </div>
  );
}

// "O que estou sentindo": anotar um novo ou editar um já anotado.
export function SymptomDialog({
  symptom,
  medications,
  onClose,
  onDone,
}: {
  symptom?: Symptom;
  medications: Medication[];
  onClose: () => void;
  onDone: Done;
}) {
  const today = todayInAppZone();
  const [description, setDescription] = useState(symptom?.description ?? '');
  const [startedOn, setStartedOn] = useState(symptom?.startedOn ?? today);
  const [endedOn, setEndedOn] = useState(symptom?.endedOn ?? '');
  const [intensity, setIntensity] = useState<number | null>(null);
  const [medicationId, setMedicationId] = useState(symptom?.medicationId ?? '');
  const [note, setNote] = useState(symptom?.note ?? '');
  const [errors, setErrors] = useState<Partial<Record<'description' | 'startedOn' | 'endedOn' | 'note', string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateSymptom();
  const update = useUpdateSymptom();
  const remove = useDeleteSymptom();
  const mutation = symptom ? update : create;
  const selectId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      description: !description.trim()
        ? 'Conte o que você tem sentido.'
        : tooLong(description, SYMPTOM_DESCRIPTION_MAX, 'o que tem sentido'),
      startedOn: dateError(startedOn, today),
      endedOn:
        symptom && endedOn
          ? (dateError(endedOn, today) ?? (endedOn < startedOn ? 'O fim precisa ser depois do começo.' : undefined))
          : undefined,
      note: tooLong(note, SYMPTOM_NOTE_MAX, 'a observação'),
    };
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const common = {
      description: description.trim(),
      startedOn,
      medicationId: medicationId || null,
      note: note.trim() || null,
    };
    if (symptom) {
      update.mutate(
        { id: symptom.id, input: { ...common, endedOn: endedOn || null } },
        { onSuccess: () => onDone('Anotação atualizada.') },
      );
    } else {
      create.mutate({ ...common, intensity }, { onSuccess: () => onDone('Anotado.') });
    }
  }

  if (symptom && confirmDelete) {
    return (
      <ConfirmDelete
        title="Apagar esta anotação?"
        text="O que você anotou e a evolução saem do Faísca. Não dá para desfazer."
        pending={remove.isPending}
        error={remove.error ? getApiError(remove.error).message : null}
        onBack={() => setConfirmDelete(false)}
        onClose={onClose}
        onConfirm={() => remove.mutate(symptom.id, { onSuccess: () => onDone('Anotação apagada.') })}
      />
    );
  }

  return (
    <Dialog title={symptom ? 'Editar o que tenho sentido' : 'Anotar o que estou sentindo'} onClose={onClose}>
      <DialogForm error={mutation.error ? getApiError(mutation.error).message : null} onSubmit={submit}>
        <TextField
          label="O que você tem sentido?"
          placeholder="Ex.: enjoo de manhã"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
        />
        <DateField label="Desde quando?" value={startedOn} onChange={setStartedOn} error={errors.startedOn} />
        {symptom && (
          <DateField
            label="Já passou em (opcional)"
            value={endedOn}
            min={startedOn || FIRST_DATE}
            onChange={setEndedOn}
            error={errors.endedOn}
          />
        )}
        {!symptom && <OptionalIntensity value={intensity} onChange={setIntensity} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={selectId} className="font-medium">
            Começou depois de algum remédio ou mudança?
          </label>
          <select
            id={selectId}
            className={`min-h-11 ${fieldClasses}`}
            value={medicationId}
            onChange={(event) => setMedicationId(event.target.value)}
          >
            <option value="">Não sei, ou nenhum</option>
            {medications.map((medication) => (
              <option key={medication.id} value={medication.id}>
                {medication.name}
              </option>
            ))}
          </select>
        </div>
        <TextAreaField
          label="Observação (opcional)"
          limit={SYMPTOM_NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          error={errors.note}
        />
        <Hint>{SAFETY_TEXT}</Hint>
        {symptom && (
          <Button variant="ghost" className="self-start px-0 underline" onClick={() => setConfirmDelete(true)}>
            Apagar esta anotação
          </Button>
        )}
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

// "Como está agora?": a intensidade num dia, uma por dia. Um dia já anotado pode ser trocado ou apagado.
export function SymptomCheckDialog({ symptom, onClose, onDone }: { symptom: Symptom; onClose: () => void; onDone: Done }) {
  const today = todayInAppZone();
  const last = symptom.endedOn ?? today;
  const [date, setDate] = useState(last);
  const existing = symptom.checks.find((check) => check.date === date) ?? null;
  const [intensity, setIntensity] = useState<number | null>(existing?.intensity ?? null);
  const [errors, setErrors] = useState<Partial<Record<'date' | 'intensity', string>>>({});
  const save = useSaveSymptomCheck();
  const remove = useDeleteSymptomCheck();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = {
      date:
        dateError(date, today) ??
        (date < symptom.startedOn || date > last ? 'Esse dia fica fora do período do que você sentiu.' : undefined),
      intensity: intensity === null ? 'Escolha a intensidade.' : undefined,
    };
    setErrors(found);
    if (found.date || intensity === null) return;
    save.mutate({ id: symptom.id, date, intensity }, { onSuccess: () => onDone('Anotado como está agora.') });
  }

  const error = save.error ?? remove.error;
  return (
    <Dialog title="Como está agora?" description={symptom.description} onClose={onClose}>
      <DialogForm error={error ? getApiError(error).message : null} onSubmit={submit}>
        <TextField
          label="Dia"
          type="date"
          min={symptom.startedOn}
          max={last}
          value={date}
          onChange={(event) => {
            const next = event.target.value;
            setDate(next);
            setIntensity(symptom.checks.find((check) => check.date === next)?.intensity ?? null);
          }}
          error={errors.date}
        />
        <ScoreField
          label="Intensidade de 0 a 10"
          value={intensity}
          onChange={setIntensity}
          minLabel={INTENSITY_TEXT.min}
          maxLabel={INTENSITY_TEXT.max}
          error={errors.intensity}
        />
        {existing && (
          <Button
            variant="ghost"
            className="self-start px-0 underline"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate({ id: symptom.id, date }, { onSuccess: () => onDone('Anotação do dia apagada.') })
            }
          >
            Apagar a anotação de {formatFullDate(date)}
          </Button>
        )}
        <Hint>{SAFETY_TEXT}</Hint>
        <DialogActions submitLabel="Salvar" pending={save.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

// "Já passou": a data em que parou de sentir.
export function EndSymptomDialog({ symptom, onClose, onDone }: { symptom: Symptom; onClose: () => void; onDone: Done }) {
  const today = todayInAppZone();
  const [endedOn, setEndedOn] = useState(today);
  const [error, setError] = useState<string | undefined>();
  const update = useUpdateSymptom();
  const lastCheck = symptom.checks.at(-1)?.date ?? symptom.startedOn;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found =
      dateError(endedOn, today) ??
      (endedOn < symptom.startedOn ? 'O fim precisa ser depois do começo.' : undefined) ??
      (endedOn < lastCheck ? `Há anotação de “como está” em ${formatFullDate(lastCheck)}: escolha esse dia ou depois.` : undefined);
    setError(found);
    if (found) return;
    update.mutate({ id: symptom.id, input: { endedOn } }, { onSuccess: () => onDone('Anotado que já passou.') });
  }

  return (
    <Dialog title="Já passou?" description={symptom.description} onClose={onClose}>
      <DialogForm error={update.error ? getApiError(update.error).message : null} onSubmit={submit}>
        <DateField label="Quando passou?" value={endedOn} min={symptom.startedOn} onChange={setEndedOn} error={error} />
        <DialogActions submitLabel="Salvar" pending={update.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
