import { useState } from 'react';
import { useSearchParams } from 'react-router';
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
import { useWeekActivities } from '../features/activities/use-activities';
import { AppointmentsCard } from '../features/appointments/appointments-card';
import { useAppointments } from '../features/appointments/use-appointments';
import {
  addDays,
  formatDayHeading,
  formatWeekRange,
  isValidDateOnly,
  startOfWeek,
  todayInAppZone,
  weekDays,
} from '../features/activities/week';
import { WeekChart } from '../features/activities/week-chart';

type OpenDialog = { kind: 'create'; date: string } | { kind: ActivityAction; activity: Activity } | null;

// "Meus registros": a semana de segunda a domingo (SPEC, Tela semanal).
// A semana fica na URL (?semana=AAAA-MM-DD) para recarregar e voltar sem perder o lugar (DEC-029).
export function RecordsPage() {
  const { data: user } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const today = todayInAppZone();
  const currentMonday = startOfWeek(today);
  const param = searchParams.get('semana');
  const monday = isValidDateOnly(param) ? startOfWeek(param) : currentMonday;
  const isCurrentWeek = monday === currentMonday;
  const days = weekDays(monday);

  const week = useWeekActivities(monday);
  const activities = week.data ?? [];
  // Dias com consulta ganham um selo na semana (DEC-030).
  const appointmentDays = new Set(useAppointments().data?.appointments.map((a) => a.appointmentDate));

  function goToWeek(target: string) {
    setNotice(null);
    setSearchParams(target === currentMonday ? {} : { semana: target });
  }

  function close() {
    setDialog(null);
  }

  function done(message?: string) {
    setDialog(null);
    setNotice(message ?? null);
  }

  const firstName = user?.name.split(' ')[0];

  return (
    <>
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold sm:text-4xl">Olá, {firstName}!</h1>
        <p className="text-muted sm:text-lg">Um espaço calmo para registrar suas atividades, no seu ritmo.</p>
      </section>

      <AppointmentsCard today={today} />

      <section aria-labelledby="week-title" className="flex flex-col gap-5 sm:gap-6">
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="px-3 text-2xl"
              aria-label="Semana anterior"
              onClick={() => goToWeek(addDays(monday, -7))}
            >
              ‹
            </Button>
            <h2 id="week-title" className="min-w-40 text-center text-2xl font-bold" aria-live="polite">
              {formatWeekRange(monday)}
            </h2>
            <Button
              variant="ghost"
              className="px-3 text-2xl"
              aria-label="Próxima semana"
              onClick={() => goToWeek(addDays(monday, 7))}
            >
              ›
            </Button>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {!isCurrentWeek && (
              <Button variant="secondary" onClick={() => goToWeek(currentMonday)}>
                Voltar para esta semana
              </Button>
            )}
            {/* No celular, o botão flutua no canto de baixo, ao alcance do polegar durante a rolagem. */}
            <Button
              className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none"
              onClick={() => setDialog({ kind: 'create', date: days.includes(today) ? today : monday })}
            >
              <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                +
              </span>
              Nova atividade
            </Button>
          </div>
        </div>

        {notice && <Alert tone="attention">{notice}</Alert>}

        {week.isPending && (
          <p className="text-muted" aria-busy="true">
            Carregando a semana…
          </p>
        )}

        {week.isError && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>Não conseguimos carregar esta semana. Confira sua conexão e tente de novo.</p>
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
                Nada registrado nesta semana ainda. Que tal planejar algo pequeno?
              </p>
            )}

            <WeekChart activities={activities} />

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
