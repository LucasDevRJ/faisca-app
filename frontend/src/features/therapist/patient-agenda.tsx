import { Alert } from '../../components/ui/alert';
import { formatDayMonth, nowTimeInAppZone } from '../activities/week';
import { describePause, describeSchedule, formatSessionDay, formatSessionDistance } from '../appointments/agenda-format';
import type { Session } from '../appointments/appointments-api';
import { PrivacyConsentGate } from '../auth/privacy-consent';
import { usePatientAppointments } from './use-therapist';

// Agenda do paciente na visão da terapeuta (DEC-045): só leitura, com os motivos de desmarcar e
// remarcar. Pede o aceite da versão do aviso que cita a agenda.

// Das anteriores, só as mais recentes: o histórico inteiro fica com o paciente.
const RECENT_COUNT = 6;

function tagOf(session: Session): string | null {
  if (session.status === 'DESMARCADA') return 'desmarcada';
  if (session.rescheduled) return `remarcada de ${formatDayMonth(session.originalDate!)}`;
  if (session.kind === 'AVULSA') return 'avulsa';
  return null;
}

function SessionRow({ session, today }: { session: Session; today: string }) {
  const tag = tagOf(session);
  return (
    <li className="flex flex-col gap-1 border-t border-border pt-2 first:border-t-0 first:pt-0">
      <p className={session.status === 'DESMARCADA' ? 'text-muted line-through' : ''}>
        <span className="inline-block font-medium first-letter:uppercase">{formatSessionDay(session)}</span>
        <span className="text-muted"> · {formatSessionDistance(session, today)}</span>
      </p>
      {tag && <span className="text-sm text-muted">{tag}</span>}
      {session.reason && <p className="text-sm text-muted">Motivo: {session.reason}</p>}
    </li>
  );
}

export function PatientAgenda({ patientId, consented, today }: { patientId: string; consented: boolean; today: string }) {
  const agenda = usePatientAppointments(patientId, consented);

  if (!consented) return <PrivacyConsentGate area="appointmentSchedule" audience="therapist" />;
  if (agenda.isPending) return <p className="text-muted">Carregando…</p>;
  if (agenda.isError) return <Alert tone="attention">Não conseguimos carregar a agenda. Tente de novo.</Alert>;

  const { schedule, pause, upcoming, sessions } = agenda.data;
  const nowTime = nowTimeInAppZone();
  const recent = sessions
    .filter((s) => s.date < today || (s.date === today && (s.time === null || s.time <= nowTime)))
    .reverse()
    .slice(0, RECENT_COUNT);

  return (
    <div className="flex flex-col gap-4">
      {schedule && <p className="font-semibold">{describeSchedule(schedule)}</p>}
      {pause && <p>{describePause(pause, today)}.</p>}
      {upcoming.length > 0 && (
        <section aria-label="Próximas sessões" className="flex flex-col gap-2">
          <h3 className="font-semibold">Próximas</h3>
          <ul className="flex flex-col gap-2">
            {upcoming.map((s) => (
              <SessionRow key={`${s.kind}-${s.appointmentId ?? s.originalDate}-${s.date}`} session={s} today={today} />
            ))}
          </ul>
        </section>
      )}
      {recent.length > 0 && (
        <section aria-label="Sessões anteriores" className="flex flex-col gap-2">
          <h3 className="font-semibold">Anteriores</h3>
          <ul className="flex flex-col gap-2">
            {recent.map((s) => (
              <SessionRow key={`${s.kind}-${s.appointmentId ?? s.originalDate}-${s.date}`} session={s} today={today} />
            ))}
          </ul>
        </section>
      )}
      {upcoming.length === 0 && recent.length === 0 && <p className="text-muted">Nenhuma sessão na agenda.</p>}
    </div>
  );
}
