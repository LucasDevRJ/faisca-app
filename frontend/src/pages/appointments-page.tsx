import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { formatDayMonth, nowTimeInAppZone, todayInAppZone } from '../features/activities/week';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import {
  describePause,
  describeSchedule,
  formatSessionDay,
  formatSessionDistance,
} from '../features/appointments/agenda-format';
import {
  CancelSessionDialog,
  DeleteExtraDialog,
  EndScheduleDialog,
  ExtraDialog,
  PauseDialog,
  RescheduleSessionDialog,
  ScheduleDialog,
} from '../features/appointments/appointment-dialogs';
import { CALENDAR_URL, type AgendaResponse, type Session } from '../features/appointments/appointments-api';
import { useAgenda, useResumeAgenda, useUndoSessionChange } from '../features/appointments/use-appointments';

type OpenDialog =
  | { kind: 'schedule' | 'pause' | 'end' | 'extra' }
  | { kind: 'cancel' | 'reschedule' | 'editExtra' | 'deleteExtra'; session: Session }
  | null;

const cardClass = 'flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-5';

// A sessão já começou? Sem hora (consulta antiga), conta o dia todo, como na API.
function hasStarted(session: Session, today: string, nowTime: string) {
  if (session.date !== today) return session.date < today;
  return session.time === null || session.time <= nowTime;
}

function SessionTag({ session }: { session: Session }) {
  let text: string | null = null;
  if (session.status === 'DESMARCADA') text = 'desmarcada';
  else if (session.rescheduled) text = `remarcada de ${formatDayMonth(session.originalDate!)}`;
  else if (session.kind === 'AVULSA') text = 'avulsa';
  if (!text) return null;
  return <span className="rounded-full border border-border px-2 py-0.5 text-sm text-muted">{text}</span>;
}

function SessionItem({ session, today, actions }: { session: Session; today: string; actions: ReactNode }) {
  const cancelled = session.status === 'DESMARCADA';
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className={cancelled ? 'text-muted line-through' : ''}>
          <span className="inline-block font-semibold first-letter:uppercase">{formatSessionDay(session)}</span>
          <span className="text-muted"> · {formatSessionDistance(session, today)}</span>
        </p>
        <SessionTag session={session} />
      </div>
      {session.reason && <p className="text-sm text-muted">Motivo: {session.reason}</p>}
      {actions && <div className="flex flex-wrap gap-1">{actions}</div>}
    </li>
  );
}

function SessionList({ title, children, empty }: { title: string; children: ReactNode[]; empty?: string }) {
  if (children.length === 0 && !empty) return null;
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {children.length === 0 ? (
        <p className="text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">{children}</ul>
      )}
    </section>
  );
}

function AgendaSummary({
  agenda,
  today,
  canWrite,
  onOpen,
}: {
  agenda: AgendaResponse;
  today: string;
  canWrite: boolean;
  onOpen: (kind: 'schedule' | 'pause' | 'end') => void;
}) {
  const resume = useResumeAgenda();
  const { status, schedule, pause } = agenda;

  return (
    <section aria-label="Sua agenda" className={cardClass}>
      <h2 className="text-lg font-semibold">Sua agenda</h2>

      {schedule && <p className="text-lg font-semibold">{describeSchedule(schedule)}</p>}
      {status === 'SEM_AGENDA' && (
        <p className="text-muted">
          Escolha o dia e a hora das sessões. Elas se repetem toda semana ou a cada duas, até você pausar ou encerrar.
        </p>
      )}
      {status === 'ENCERRADA' && <p className="text-muted">Terapia encerrada. Para voltar, é só agendar de novo.</p>}
      {pause && <p>{describePause(pause, today)}.</p>}
      {resume.error && <Alert tone="attention">{getApiError(resume.error).message}</Alert>}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {schedule ? (
            <>
              <Button variant="secondary" onClick={() => onOpen('schedule')}>
                Mudar
              </Button>
              {pause ? (
                <Button variant="secondary" disabled={resume.isPending} onClick={() => resume.mutate()}>
                  {resume.isPending ? 'Retomando…' : 'Retomar agora'}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => onOpen('pause')}>
                  Pausar
                </Button>
              )}
              <Button variant="ghost" onClick={() => onOpen('end')}>
                Encerrar
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpen('schedule')}>
              {status === 'ENCERRADA' ? 'Agendar de novo' : 'Configurar agenda'}
            </Button>
          )}
        </div>
      )}

      {agenda.upcoming.length > 0 && (
        // Download direto: o cookie de sessão vai junto, porque /api é do próprio domínio.
        <a href={CALENDAR_URL} download className={buttonClasses('ghost', 'self-start px-0 underline')}>
          Adicionar à agenda do celular
        </a>
      )}
    </section>
  );
}

// Agenda de consultas do paciente (SPEC, Consultas; DEC-045).
export function AppointmentsPage() {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const { data, isPending, isError, refetch } = useAgenda();
  const { data: user } = useSession();
  const undo = useUndoSessionChange();
  const today = todayInAppZone();
  const nowTime = nowTimeInAppZone();
  // Hora, motivos e pausas pedem o aceite da versão do aviso que cita a agenda (DEC-045).
  const canWrite = Boolean(user?.privacyAreas.appointmentSchedule);

  const previous = (data?.sessions ?? []).filter((s) => hasStarted(s, today, nowTime)).reverse();

  function actionsFor(session: Session, upcoming: boolean): ReactNode {
    if (!canWrite) return null;
    const label = formatSessionDay(session);
    const button = (text: string, onClick: () => void, aria: string) => (
      <Button variant="ghost" className="px-3" aria-label={aria} onClick={onClick}>
        {text}
      </Button>
    );
    if (session.kind === 'AVULSA') {
      return (
        <>
          {upcoming && button('Mudar', () => setDialog({ kind: 'editExtra', session }), `Mudar a consulta de ${label}`)}
          {button('Excluir', () => setDialog({ kind: 'deleteExtra', session }), `Excluir a consulta de ${label}`)}
        </>
      );
    }
    if (session.status === 'DESMARCADA' || session.rescheduled) {
      return button(
        'Desfazer',
        () => undo.mutate(session.originalDate!),
        `Desfazer a ${session.rescheduled ? 'remarcação' : 'desmarcação'} de ${label}`,
      );
    }
    return (
      <>
        {upcoming && button('Remarcar', () => setDialog({ kind: 'reschedule', session }), `Remarcar a sessão de ${label}`)}
        {button(
          upcoming ? 'Desmarcar' : 'Registrar falta',
          () => setDialog({ kind: 'cancel', session }),
          `${upcoming ? 'Desmarcar' : 'Registrar falta na'} sessão de ${label}`,
        )}
      </>
    );
  }

  const key = (s: Session) => `${s.kind}-${s.appointmentId ?? s.originalDate}-${s.date}`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link to="/registros" className="self-start font-medium text-primary-text underline underline-offset-4">
          ‹ Meus registros
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Consultas</h1>
          {canWrite && (
            <Button variant="secondary" onClick={() => setDialog({ kind: 'extra' })}>
              Nova consulta avulsa
            </Button>
          )}
        </div>
        <p className="text-muted">As sessões ajudam a ver o caminho entre uma consulta e outra.</p>
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

      {user && !canWrite && <PrivacyConsentGate area="appointmentSchedule" />}

      {data && (
        <>
          <AgendaSummary
            agenda={data}
            today={today}
            canWrite={canWrite}
            onOpen={(kind) => setDialog({ kind })}
          />

          {undo.error && <Alert tone="attention">{getApiError(undo.error).message}</Alert>}

          <SessionList title="Próximas" empty={data.schedule ? undefined : 'Nenhuma sessão marcada.'}>
            {data.upcoming.map((session) => (
              <SessionItem key={key(session)} session={session} today={today} actions={actionsFor(session, true)} />
            ))}
          </SessionList>
          <SessionList title="Anteriores">
            {previous.map((session) => (
              <SessionItem key={key(session)} session={session} today={today} actions={actionsFor(session, false)} />
            ))}
          </SessionList>
        </>
      )}

      {dialog?.kind === 'schedule' && (
        <ScheduleDialog schedule={data?.schedule ?? null} today={today} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'pause' && <PauseDialog today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'end' && <EndScheduleDialog onClose={() => setDialog(null)} />}
      {dialog?.kind === 'extra' && <ExtraDialog today={today} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'editExtra' && (
        <ExtraDialog session={dialog.session} today={today} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'deleteExtra' && <DeleteExtraDialog session={dialog.session} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cancel' && <CancelSessionDialog session={dialog.session} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reschedule' && (
        <RescheduleSessionDialog session={dialog.session} onClose={() => setDialog(null)} />
      )}
    </>
  );
}
