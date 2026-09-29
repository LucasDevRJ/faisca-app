import { Link } from 'react-router';
import { formatDayHeading, formatRelativeDay } from '../activities/week';
import type { Appointment } from './appointments-api';
import { useAppointments } from './use-appointments';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// Também usada na visão da terapeuta (pacientes/:id), dentro de um <dl>.
export function AppointmentLine({ label, appointment, today }: { label: string; appointment: Appointment; today: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold">
        <span className="inline-block first-letter:uppercase">{formatDayHeading(appointment.appointmentDate)}</span>
        <span className="font-normal text-muted"> · {formatRelativeDay(appointment.appointmentDate, today)}</span>
      </dd>
    </div>
  );
}

// Resumo no topo de "Meus registros": última e próxima consulta (SPEC, Consultas).
export function AppointmentsCard({ today }: { today: string }) {
  const { data, isPending, isError } = useAppointments();

  // A semana é o principal da tela: se as consultas não carregarem, o card só não aparece.
  if (isPending || isError) return null;

  const { last, next } = data;

  return (
    <section
      aria-labelledby="appointments-title"
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="appointments-title" className="text-lg font-semibold">
          Consultas
        </h2>
        <Link to="/consultas" className={linkClass}>
          {last || next ? 'Ver consultas' : 'Cadastrar'}
        </Link>
      </div>

      {last || next ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          {next && <AppointmentLine label="Próxima" appointment={next} today={today} />}
          {last && <AppointmentLine label="Última" appointment={last} today={today} />}
        </dl>
      ) : (
        <p className="text-muted">Cadastre suas consultas para acompanhar o caminho entre uma e outra.</p>
      )}
    </section>
  );
}
