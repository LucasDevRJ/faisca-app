import { Link } from 'react-router';
import { todayInAppZone } from '../activities/week';
import { describePause, formatSessionDay, formatSessionDistance } from './agenda-format';
import { useAgenda } from './use-appointments';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

type SessionWhen = { date: string; time: string | null };

// Também usada na visão da terapeuta (pacientes/:id), dentro de um <dl>.
export function AppointmentLine({ label, session, today }: { label: string; session: SessionWhen; today: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-semibold">
        <span className="inline-block first-letter:uppercase">{formatSessionDay(session)}</span>
        <span className="font-normal text-muted"> · {formatSessionDistance(session, today)}</span>
      </dd>
    </div>
  );
}

// Resumo no topo de "Meus registros": próxima e última consulta e a situação da agenda (DEC-045).
export function AppointmentsCard({ today = todayInAppZone() }: { today?: string }) {
  const { data, isPending, isError } = useAgenda();

  // A semana é o principal da tela: se as consultas não carregarem, o card só não aparece.
  if (isPending || isError) return null;

  const { last, next, status, pause } = data;
  const noSchedule = status === 'SEM_AGENDA';

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
          {noSchedule ? 'Configurar agenda' : 'Ver agenda'}
        </Link>
      </div>

      {(last || next) && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {next && <AppointmentLine label="Próxima" session={next} today={today} />}
          {last && <AppointmentLine label="Última" session={last} today={today} />}
        </dl>
      )}

      {noSchedule && (
        <p className="text-muted">
          Configure sua agenda: escolha o dia e a hora das sessões, e elas se repetem toda semana ou a cada duas.
        </p>
      )}
      {status === 'PAUSADA' && pause && <p className="text-muted">{describePause(pause, today)}.</p>}
      {status === 'ENCERRADA' && <p className="text-muted">Terapia encerrada. Para voltar, é só agendar de novo.</p>}
    </section>
  );
}
