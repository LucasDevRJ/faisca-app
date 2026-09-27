import { useState } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { formatDayHeading, formatRelativeDay, todayInAppZone } from '../features/activities/week';
import { AppointmentDialog, DeleteAppointmentDialog } from '../features/appointments/appointment-dialogs';
import type { Appointment } from '../features/appointments/appointments-api';
import { useAppointments } from '../features/appointments/use-appointments';

type OpenDialog = { kind: 'create' } | { kind: 'edit' | 'delete'; appointment: Appointment } | null;

function AppointmentList({
  title,
  items,
  today,
  onAction,
}: {
  title: string;
  items: Appointment[];
  today: string;
  onAction: (kind: 'edit' | 'delete', appointment: Appointment) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2">
        {items.map((appointment) => (
          <li
            key={appointment.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4"
          >
            <p>
              <span className="inline-block font-semibold first-letter:uppercase">
                {formatDayHeading(appointment.appointmentDate)}
              </span>
              <span className="text-muted"> · {formatRelativeDay(appointment.appointmentDate, today)}</span>
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                className="px-3"
                aria-label={`Mudar data da consulta de ${formatDayHeading(appointment.appointmentDate)}`}
                onClick={() => onAction('edit', appointment)}
              >
                Mudar data
              </Button>
              <Button
                variant="ghost"
                className="px-3"
                aria-label={`Excluir a consulta de ${formatDayHeading(appointment.appointmentDate)}`}
                onClick={() => onAction('delete', appointment)}
              >
                Excluir
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Consultas do paciente (SPEC, Consultas; DEC-030): próximas primeiro, depois as anteriores.
export function AppointmentsPage() {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { data, isPending, isError, refetch } = useAppointments();
  const today = todayInAppZone();

  const appointments = data?.appointments ?? [];
  // A API manda da mais recente para a mais antiga; as próximas ficam da mais perto para a mais longe.
  const upcoming = appointments.filter((a) => a.appointmentDate > today).reverse();
  const previous = appointments.filter((a) => a.appointmentDate <= today);

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/registros" className="self-start font-medium text-primary-text underline underline-offset-4">
          ‹ Meus registros
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Consultas</h1>
          {/* No celular, flutua no canto de baixo, como em "Nova atividade". */}
          <Button
            className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none"
            onClick={() => setDialog({ kind: 'create' })}
          >
            <span aria-hidden="true" className="text-xl leading-none sm:hidden">
              +
            </span>
            Nova consulta
          </Button>
        </div>
        <p className="text-muted">
          As datas das consultas ajudam a ver o caminho entre uma sessão e outra.
        </p>
      </div>

      {isPending && (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      )}

      {isError && (
        <Alert tone="attention">
          <div className="flex flex-col gap-3">
            <p>Não conseguimos carregar suas consultas. Confira sua conexão e tente de novo.</p>
            <div>
              <Button variant="secondary" onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {data && appointments.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          Nenhuma consulta cadastrada ainda.
        </p>
      )}

      <AppointmentList
        title="Próximas"
        items={upcoming}
        today={today}
        onAction={(kind, appointment) => setDialog({ kind, appointment })}
      />
      <AppointmentList
        title="Anteriores"
        items={previous}
        today={today}
        onAction={(kind, appointment) => setDialog({ kind, appointment })}
      />

      {dialog?.kind === 'create' && <AppointmentDialog initialDate={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'edit' && (
        <AppointmentDialog
          appointment={dialog.appointment}
          initialDate={dialog.appointment.appointmentDate}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteAppointmentDialog appointment={dialog.appointment} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
