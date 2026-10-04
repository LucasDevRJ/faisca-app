import { useState, type FormEvent } from 'react';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { TextAreaField, TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { isValidDateOnly } from '../activities/week';
import { formatSessionDay } from './agenda-format';
import type { Frequency, Schedule, Session } from './appointments-api';
import {
  useCancelSession,
  useCreateExtra,
  useDeleteExtra,
  useEndSchedule,
  usePauseAgenda,
  useRescheduleSession,
  useSetSchedule,
  useUpdateExtra,
} from './use-appointments';

// Diálogos da agenda (DEC-045). Erro de validação da API vai para o campo; os outros (ex.: 409,
// já existe consulta nesse dia) aparecem no topo do formulário.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Mesmo limite do backend (DEC-045).
const REASON_MAX = 500;

type FieldErrors = Record<string, string | undefined>;

function useApiError(error: unknown) {
  const apiError = error ? getApiError(error) : null;
  return {
    top: (fields: string[]) => (apiError && !fields.some((f) => apiError.fields[f]) ? apiError.message : null),
    field: (name: string) => apiError?.fields[name],
  };
}

function checkDate(value: string, label = 'Escolha uma data.') {
  return isValidDateOnly(value) ? undefined : label;
}

function checkTime(value: string) {
  return TIME.test(value) ? undefined : 'Escolha a hora.';
}

function checkReason(value: string) {
  if (!value.trim()) return 'Conte o motivo.';
  return value.trim().length > REASON_MAX ? `O motivo pode ter até ${REASON_MAX} caracteres.` : undefined;
}

function hasErrors(errors: FieldErrors) {
  return Object.values(errors).some(Boolean);
}

// Configurar a agenda ou mudar dia, hora ou frequência.
export function ScheduleDialog({
  schedule,
  today,
  onClose,
}: {
  schedule: Schedule | null;
  today: string;
  onClose: () => void;
}) {
  const [startDate, setStartDate] = useState(today);
  const [time, setTime] = useState(schedule?.time ?? '');
  const [frequency, setFrequency] = useState<Frequency>(schedule?.frequency ?? 'SEMANAL');
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useSetSchedule();
  const apiError = useApiError(mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { startDate: checkDate(startDate), time: checkTime(time) };
    setErrors(next);
    if (hasErrors(next)) return;
    mutation.mutate({ startDate, time, frequency }, { onSuccess: onClose });
  }

  return (
    <Dialog title={schedule ? 'Mudar a agenda' : 'Configurar agenda'} onClose={onClose}>
      <DialogForm onSubmit={handleSubmit} error={apiError.top(['startDate', 'time', 'frequency'])}>
        <TextField
          label={schedule ? 'A partir de' : 'Dia da primeira sessão'}
          hint={
            schedule
              ? 'O dia da primeira sessão da agenda nova. As sessões até a véspera continuam como estão.'
              : 'O dia da semana das sessões sai desta data. Pode ser uma sessão que já aconteceu.'
          }
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            mutation.reset();
          }}
          error={errors.startDate ?? apiError.field('startDate')}
        />
        <TextField
          label="Hora"
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            mutation.reset();
          }}
          error={errors.time ?? apiError.field('time')}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-medium">Frequência</legend>
          {(
            [
              ['SEMANAL', 'Toda semana'],
              ['QUINZENAL', 'A cada duas semanas'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="frequency"
                value={value}
                checked={frequency === value}
                onChange={() => setFrequency(value)}
                className="size-4 accent-primary"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function PauseDialog({ today, onClose }: { today: string; onClose: () => void }) {
  const [startDate, setStartDate] = useState(today);
  const [returnDate, setReturnDate] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = usePauseAgenda();
  const apiError = useApiError(mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = {
      startDate: checkDate(startDate),
      returnDate: returnDate === '' ? undefined : checkDate(returnDate),
    };
    setErrors(next);
    if (hasErrors(next)) return;
    mutation.mutate({ startDate, returnDate: returnDate || null }, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Pausar a terapia"
      description="Durante a pausa, não há sessões. Seus registros continuam liberados."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError.top(['startDate', 'returnDate'])}>
        <TextField
          label="Começa em"
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            mutation.reset();
          }}
          error={errors.startDate ?? apiError.field('startDate')}
        />
        <TextField
          label="Volta em (opcional)"
          hint="Deixe em branco para retomar quando quiser. Com a data, as sessões voltam sozinhas."
          type="date"
          value={returnDate}
          onChange={(e) => {
            setReturnDate(e.target.value);
            mutation.reset();
          }}
          error={errors.returnDate ?? apiError.field('returnDate')}
        />
        <DialogActions submitLabel="Pausar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function EndScheduleDialog({ onClose }: { onClose: () => void }) {
  const mutation = useEndSchedule();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Encerrar a terapia?"
      description="As próximas sessões saem da agenda, e o histórico fica. Para voltar, é só agendar de novo."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={mutation.error ? getApiError(mutation.error).message : null}>
        <DialogActions submitLabel="Encerrar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

function ReasonField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <TextAreaField
      label="Motivo"
      hint="Ajuda a sua terapeuta a entender o que aconteceu."
      rows={3}
      maxLength={REASON_MAX}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
    />
  );
}

export function CancelSessionDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const mutation = useCancelSession();
  const apiError = useApiError(mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = checkReason(reason);
    setError(invalid);
    if (invalid) return;
    mutation.mutate({ originalDate: session.originalDate!, reason: reason.trim() }, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Desmarcar esta sessão?"
      description={<span className="inline-block first-letter:uppercase">{formatSessionDay(session)}</span>}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError.top(['reason'])}>
        <ReasonField
          value={reason}
          onChange={(value) => {
            setReason(value);
            mutation.reset();
          }}
          error={error ?? apiError.field('reason')}
        />
        <DialogActions submitLabel="Desmarcar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function RescheduleSessionDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [date, setDate] = useState(session.date);
  const [time, setTime] = useState(session.time ?? '');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const mutation = useRescheduleSession();
  const apiError = useApiError(mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { date: checkDate(date), time: checkTime(time), reason: checkReason(reason) };
    setErrors(next);
    if (hasErrors(next)) return;
    mutation.mutate(
      { originalDate: session.originalDate!, date, time, reason: reason.trim() },
      { onSuccess: onClose },
    );
  }

  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    mutation.reset();
  };

  return (
    <Dialog
      title="Remarcar esta sessão"
      description={<span className="inline-block first-letter:uppercase">{formatSessionDay(session)}</span>}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError.top(['date', 'time', 'reason'])}>
        <TextField
          label="Novo dia"
          type="date"
          value={date}
          onChange={(e) => change(setDate)(e.target.value)}
          error={errors.date ?? apiError.field('date')}
        />
        <TextField
          label="Nova hora"
          type="time"
          value={time}
          onChange={(e) => change(setTime)(e.target.value)}
          error={errors.time ?? apiError.field('time')}
        />
        <ReasonField value={reason} onChange={change(setReason)} error={errors.reason ?? apiError.field('reason')} />
        <DialogActions submitLabel="Remarcar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

// Consulta avulsa: nova ou mudança de dia e hora.
export function ExtraDialog({
  session,
  today,
  onClose,
}: {
  session?: Session;
  today: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(session?.date ?? today);
  const [time, setTime] = useState(session?.time ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useCreateExtra();
  const update = useUpdateExtra();
  const mutation = session ? update : create;
  const apiError = useApiError(mutation.error);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { appointmentDate: checkDate(date), appointmentTime: checkTime(time) };
    setErrors(next);
    if (hasErrors(next)) return;
    const input = { appointmentDate: date, appointmentTime: time };
    if (session) update.mutate({ id: session.appointmentId!, ...input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  }

  return (
    <Dialog
      title={session ? 'Mudar a consulta avulsa' : 'Nova consulta avulsa'}
      description={session ? undefined : 'Uma sessão extra, fora da agenda.'}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={apiError.top(['appointmentDate', 'appointmentTime'])}>
        <TextField
          label="Dia da consulta"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            mutation.reset();
          }}
          error={errors.appointmentDate ?? apiError.field('appointmentDate')}
        />
        <TextField
          label="Hora"
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            mutation.reset();
          }}
          error={errors.appointmentTime ?? apiError.field('appointmentTime')}
        />
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function DeleteExtraDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const remove = useDeleteExtra();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    remove.mutate(session.appointmentId!, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Excluir esta consulta?"
      description={<span className="inline-block first-letter:uppercase">{formatSessionDay(session)}</span>}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={remove.error ? getApiError(remove.error).message : null}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
