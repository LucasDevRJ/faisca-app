import { useState, type FormEvent } from 'react';
import { Dialog, DialogActions, DialogForm } from '../../components/ui/dialog';
import { TextField } from '../../components/ui/text-field';
import { getApiError } from '../auth/auth-api';
import { formatDayHeading, isValidDateOnly } from '../activities/week';
import type { Appointment } from './appointments-api';
import { useCreateAppointment, useDeleteAppointment, useUpdateAppointment } from './use-appointments';

// Nova consulta ou mudança de data: o mesmo formulário, só com o dia (DEC-030).
export function AppointmentDialog({
  appointment,
  initialDate,
  onClose,
}: {
  appointment?: Appointment;
  initialDate: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(appointment?.appointmentDate ?? initialDate);
  const [error, setError] = useState<string>();
  const create = useCreateAppointment();
  const update = useUpdateAppointment();
  const mutation = appointment ? update : create;
  const apiError = mutation.error ? getApiError(mutation.error) : null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = isValidDateOnly(date) ? undefined : 'Escolha uma data.';
    setError(invalid);
    if (invalid) return;
    if (appointment && date === appointment.appointmentDate) {
      onClose();
      return;
    }
    if (appointment) update.mutate({ id: appointment.id, appointmentDate: date }, { onSuccess: onClose });
    else create.mutate(date, { onSuccess: onClose });
  }

  return (
    <Dialog title={appointment ? 'Mudar a data da consulta' : 'Nova consulta'} onClose={onClose}>
      {/* Erro de validação da API vai para o campo; os outros (ex.: 409, já existe consulta
          nesse dia) aparecem no topo do formulário. */}
      <DialogForm
        onSubmit={handleSubmit}
        error={apiError && !apiError.fields.appointmentDate ? apiError.message : null}
      >
        <TextField
          label="Dia da consulta"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            mutation.reset();
          }}
          error={error ?? apiError?.fields.appointmentDate}
        />
        <DialogActions submitLabel="Salvar" pending={mutation.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}

export function DeleteAppointmentDialog({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const remove = useDeleteAppointment();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    remove.mutate(appointment.id, { onSuccess: onClose });
  }

  return (
    <Dialog
      title="Excluir esta consulta?"
      description={<span className="first-letter:uppercase">{formatDayHeading(appointment.appointmentDate)}</span>}
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={remove.error ? getApiError(remove.error).message : null}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
