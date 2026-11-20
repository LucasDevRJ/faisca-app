import { useState } from 'react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { addDays, formatDayHeading, todayInAppZone } from '../features/activities/week';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod } from '../features/cycle/use-period';
import { CHECK_IN_WINDOW_DAYS, checkInSummary } from '../features/daily-check-ins/check-in-labels';
import { CheckInDialog } from '../features/daily-check-ins/check-in-dialog';
import type { CheckIn } from '../features/daily-check-ins/daily-check-ins-api';
import { SleepMoodChart } from '../features/daily-check-ins/sleep-mood-chart';
import { useCheckIns } from '../features/daily-check-ins/use-daily-check-ins';
import { changeMarkers } from '../features/medications/medication-labels';
import { MedicationsSection } from '../features/medications/medications-section';
import { useMedications } from '../features/medications/use-medications';
import { daysInRange } from '../features/therapist/period';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

// "Sono e humor" (DEC-107, DEC-108): o gráfico do período e os dias. Registrar e editar vale para os
// últimos 7 dias; os mais antigos ficam só para ver. O período segue o ciclo ou a semana (DEC-050).
// Com "Anotar meus remédios e o que sinto" ligado, entram os remédios e o que sinto (DEC-115), e as
// mudanças do período viram linhas no gráfico.
export function SleepMoodPage() {
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.sleepMood);
  const today = todayInAppZone();
  const firstEditable = addDays(today, -(CHECK_IN_WINDOW_DAYS - 1));
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const range = period ?? { from: today, to: today };
  const query = useCheckIns(range, consented && period !== null);
  const [editing, setEditing] = useState<{ date: string; checkIn: CheckIn | null } | null>(null);
  const medications = useMedications(Boolean(user?.privacyAreas.medications));
  const markers =
    medications.data?.listsMedications && period ? changeMarkers(medications.data.medications, period) : [];
  const [notice, setNotice] = useState('');

  const checkIns = query.data?.checkIns ?? [];
  const byDate = new Map(checkIns.map((checkIn) => [checkIn.date, checkIn]));
  // Do mais recente ao mais antigo: só os dias com registro ou os que ainda aceitam registro.
  const days = daysInRange(range)
    .filter((day) => day <= today && (byDate.has(day) || day >= firstEditable))
    .reverse();

  const header = (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold sm:text-4xl">Sono e humor</h1>
      <p className="text-muted sm:text-lg">
        Como você dormiu e como está o dia, em menos de um minuto. Dá para registrar e editar os últimos{' '}
        {CHECK_IN_WINDOW_DAYS} dias.
      </p>
    </section>
  );

  if (!consented || (query.isError && needsPrivacyConsent(query.error))) {
    return (
      <>
        {header}
        <PrivacyConsentGate area="sleepMood" />
      </>
    );
  }

  return (
    <>
      {header}

      <section aria-labelledby="period-title" className="flex flex-col gap-5 sm:gap-6">
        {period ? (
          <PeriodNav
            period={period}
            today={today}
            audience="patient"
            currentMonday={currentMonday}
            onCycle={(date) => {
              setNotice('');
              showCycle(date);
            }}
            onWeek={(target) => {
              setNotice('');
              showWeek(target);
            }}
          />
        ) : (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        <p role="status" className="text-muted empty:hidden">
          {notice}
        </p>

        {period && query.isPending && (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {query.isError && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
              <div>
                <Button variant="secondary" onClick={() => query.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {query.isSuccess && (
          <>
            {checkIns.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
                Nada registrado neste período ainda. Quando quiser, registre como dormiu e como está o dia.
              </p>
            ) : (
              <div className="rounded-lg border border-border bg-surface p-4 shadow-soft">
                <SleepMoodChart points={checkIns} markers={markers} />
              </div>
            )}
          </>
        )}

        {/* Os remédios têm consulta própria: não somem se a do sono falhar (revisor-telas). */}
        <MedicationsSection />

        {query.isSuccess && (
          <>
            <ol className="flex flex-col gap-3">
              {days.map((day) => {
                const checkIn = byDate.get(day) ?? null;
                const editable = day >= firstEditable;
                return (
                  <li
                    key={day}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h2 className="font-semibold first-letter:uppercase">
                        {formatDayHeading(day)}
                        {day === today && (
                          <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">
                            hoje
                          </span>
                        )}
                      </h2>
                      {checkIn ? (
                        <>
                          <p className="break-words text-muted">{checkInSummary(checkIn)}</p>
                          {checkIn.moodWord && <p className="break-words">“{checkIn.moodWord}”</p>}
                        </>
                      ) : (
                        <p className="text-muted">Sem registro.</p>
                      )}
                    </div>
                    {editable && (
                      <Button
                        variant={checkIn ? 'secondary' : 'primary'}
                        className="self-start sm:self-auto"
                        onClick={() => {
                          setNotice('');
                          setEditing({ date: day, checkIn });
                        }}
                      >
                        {checkIn ? 'Editar' : 'Registrar'}
                        <span className="sr-only"> {formatDayHeading(day)}</span>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </section>

      {editing && query.isSuccess && (
        <CheckInDialog
          date={editing.date}
          checkIn={editing.checkIn}
          tracksMedication={query.data.tracksMedication}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}
