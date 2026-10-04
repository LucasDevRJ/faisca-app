import { useState } from 'react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { useSession } from '../features/auth/use-session';
import type { Activity } from '../features/activities/activities-api';
import { ActivityCard, type ActivityAction } from '../features/activities/activity-card';
import {
  CompleteActivityDialog,
  CreateActivityDialog,
  DeleteActivityDialog,
  EditActivityDialog,
  NotDoneDialog,
  StartActivityDialog,
} from '../features/activities/activity-dialogs';
import { useRangeActivities } from '../features/activities/use-activities';
import { AppointmentsCard } from '../features/appointments/appointments-card';
import { sessionDays } from '../features/appointments/appointments-api';
import { useAgenda } from '../features/appointments/use-appointments';
import { NewLinkNotice } from '../features/links/new-link-notice';
import { formatDayHeading, todayInAppZone } from '../features/activities/week';
import { WeekChart } from '../features/activities/week-chart';
import { PatientCycleSummary } from '../features/cycle/cycle-summary';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod, type Period } from '../features/cycle/use-period';
import { daysInRange } from '../features/therapist/period';

type OpenDialog = { kind: 'create'; date: string } | { kind: ActivityAction; activity: Activity } | null;

// "Meus registros": o ciclo da consulta ou a semana de segunda a domingo (SPEC; DEC-050).
// O período fica na URL (?ciclo= ou ?semana=) para recarregar e voltar sem perder o lugar (DEC-029).
export function RecordsPage() {
  const { data: user } = useSession();
  const today = todayInAppZone();
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold sm:text-4xl">Olá, {firstName}!</h1>
        <p className="text-muted sm:text-lg">Um espaço calmo para registrar suas atividades, no seu ritmo.</p>
      </section>

      <NewLinkNotice />

      <AppointmentsCard today={today} />

      {period ? (
        <PeriodRecords
          period={period}
          today={today}
          currentMonday={currentMonday}
          onCycle={showCycle}
          onWeek={showWeek}
        />
      ) : (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      )}
    </>
  );
}

type PeriodRecordsProps = {
  period: Period;
  today: string;
  currentMonday: string;
  onCycle: (date: string | null) => void;
  onWeek: (monday: string) => void;
};

function PeriodRecords({ period, today, currentMonday, onCycle, onWeek }: PeriodRecordsProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const days = daysInRange(period);
  const inCycle = period.mode === 'cycle';
  const here = inCycle ? 'neste ciclo' : 'nesta semana';

  const week = useRangeActivities(period);
  const activities = week.data ?? [];
  // Dias com sessão agendada ganham um selo (DEC-030, DEC-045).
  const appointmentDays = new Set(sessionDays(useAgenda({ from: period.from, to: period.to }).data));

  function close() {
    setDialog(null);
  }

  function done(message?: string) {
    setDialog(null);
    setNotice(message ?? null);
  }

  return (
    <>
      <section aria-labelledby="period-title" className="flex flex-col gap-5 sm:gap-6">
        <PeriodNav
          period={period}
          today={today}
          audience="patient"
          currentMonday={currentMonday}
          onCycle={(date) => {
            setNotice(null);
            onCycle(date);
          }}
          onWeek={(monday) => {
            setNotice(null);
            onWeek(monday);
          }}
          summary={<PatientCycleSummary range={period} />}
          actions={
            // No celular, o botão flutua no canto de baixo, ao alcance do polegar durante a rolagem.
            <Button
              className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none"
              onClick={() => setDialog({ kind: 'create', date: days.includes(today) ? today : period.from })}
            >
              <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                +
              </span>
              Nova atividade
            </Button>
          }
        />

        {notice && <Alert tone="attention">{notice}</Alert>}

        {week.isPending && (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {week.isError && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
              <div>
                <Button variant="secondary" onClick={() => week.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {week.isSuccess && (
          <>
            {activities.length === 0 && (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
                Nada registrado {here} ainda. Que tal planejar algo pequeno?
              </p>
            )}

            <WeekChart activities={activities} period={inCycle ? 'no ciclo' : 'na semana'} />

            <ol className="flex flex-col gap-2 sm:gap-6">
              {days.map((day) => {
                const ofDay = activities.filter((a) => a.activityDate === day);
                const isToday = day === today;
                return (
                  <li key={day} className="flex flex-col gap-2 sm:gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={`font-semibold first-letter:uppercase sm:text-lg ${ofDay.length ? '' : 'text-muted'}`}
                      >
                        {formatDayHeading(day)}
                        {isToday && (
                          <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">
                            hoje
                          </span>
                        )}
                        {appointmentDays.has(day) && (
                          <span className="ml-2 rounded-sm border border-primary px-2 py-0.5 text-sm font-medium text-primary-text">
                            consulta
                          </span>
                        )}
                      </h3>
                      <Button
                        variant="ghost"
                        className="px-3 text-2xl"
                        aria-label={`Adicionar atividade em ${formatDayHeading(day)}`}
                        onClick={() => setDialog({ kind: 'create', date: day })}
                      >
                        +
                      </Button>
                    </div>
                    {ofDay.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {ofDay.map((activity) => (
                          <ActivityCard
                            key={activity.id}
                            activity={activity}
                            today={today}
                            onAction={(kind, a) => {
                              setNotice(null);
                              setDialog({ kind, activity: a });
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {dialog?.kind === 'create' && <CreateActivityDialog initialDate={dialog.date} onClose={close} onDone={done} />}
      {dialog?.kind === 'edit' && <EditActivityDialog activity={dialog.activity} onClose={close} onDone={done} />}
      {dialog?.kind === 'start' && <StartActivityDialog activity={dialog.activity} onClose={close} onDone={done} />}
      {dialog?.kind === 'complete' && (
        <CompleteActivityDialog activity={dialog.activity} onClose={close} onDone={done} />
      )}
      {dialog?.kind === 'notDone' && <NotDoneDialog activity={dialog.activity} onClose={close} onDone={done} />}
      {dialog?.kind === 'delete' && <DeleteActivityDialog activity={dialog.activity} onClose={close} onDone={done} />}
    </>
  );
}
