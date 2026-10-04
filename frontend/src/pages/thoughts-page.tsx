import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { getApiError } from '../features/auth/auth-api';
import { useSession } from '../features/auth/use-session';
import { formatDayHeading, todayInAppZone } from '../features/activities/week';
import { PatientCycleSummary } from '../features/cycle/cycle-summary';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod } from '../features/cycle/use-period';
import { daysInRange } from '../features/therapist/period';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { ThoughtRecordCard } from '../features/thought-records/thought-record-card';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import {
  needsPrivacyConsent,
  useDeleteThoughtRecord,
  useRangeThoughtRecords,
} from '../features/thought-records/use-thought-records';

// Aviso vindo de outra página (ex.: "Registro salvo."), por navigate(..., { state }).
export type ThoughtsPageState = { notice?: string } | null;

// "Pensamentos": o Registro de Pensamentos do paciente (SPEC, "Registro de Pensamentos"; DEC-040).
// O período (ciclo da consulta ou semana) fica na URL, como em /registros (DEC-029, DEC-050).
export function ThoughtsPage() {
  const { data: user } = useSession();
  const location = useLocation();
  const [toDelete, setToDelete] = useState<ThoughtRecord | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as ThoughtsPageState)?.notice ?? null);

  const consented = Boolean(user?.privacyAreas.thoughtRecords);
  const today = todayInAppZone();
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const range = period ?? { from: today, to: today };
  const here = period?.mode === 'cycle' ? 'neste ciclo' : 'nesta semana';
  const week = useRangeThoughtRecords(range, consented && period !== null);
  const records = week.data ?? [];
  // Sem registro, o dia não aparece: o RPD não é diário.
  const days = daysInRange(range).filter((day) => records.some((r) => r.situationDate === day));
  // O novo registro sugere hoje ou, num período passado, o último dia dele.
  const newDate = range.to < today ? range.to : today;

  const header = (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold sm:text-4xl">Registro de Pensamentos</h1>
      <p className="text-muted sm:text-lg">
        Quando algo mexer com você, anote a situação, o que pensou, o que sentiu, o que fez e o que veio depois.
      </p>
    </section>
  );

  if (!consented || (week.isError && needsPrivacyConsent(week.error))) {
    return (
      <>
        {header}
        <PrivacyConsentGate area="thoughtRecords" />
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
              setNotice(null);
              showCycle(date);
            }}
            onWeek={(target) => {
              setNotice(null);
              showWeek(target);
            }}
            summary={<PatientCycleSummary range={period} />}
            actions={
              // No celular, o botão flutua no canto de baixo, como "Nova atividade".
              <Link
                to={`/pensamentos/novo?dia=${newDate}`}
                className={buttonClasses(
                  'primary',
                  'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none',
                )}
              >
                <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                  +
                </span>
                Novo registro
              </Link>
            }
          />
        ) : (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {notice && <Alert>{notice}</Alert>}

        {period && week.isPending && (
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

        {week.isSuccess && records.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
            Nada anotado {here}. Quando algo mexer com você, dá para anotar aqui.
          </p>
        )}

        {week.isSuccess && records.length > 0 && (
          <ol className="flex flex-col gap-4 sm:gap-6">
            {days.map((day) => (
              <li key={day} className="flex flex-col gap-2 sm:gap-3">
                <h3 className="font-semibold first-letter:uppercase sm:text-lg">
                  {formatDayHeading(day)}
                  {day === today && (
                    <span className="ml-2 rounded-sm bg-primary px-2 py-0.5 text-sm font-medium text-on-primary">
                      hoje
                    </span>
                  )}
                </h3>
                <div className="flex flex-col gap-3">
                  {records
                    .filter((r) => r.situationDate === day)
                    .map((record) => (
                      <ThoughtRecordCard
                        key={record.id}
                        record={record}
                        onDelete={(r) => {
                          setNotice(null);
                          setToDelete(r);
                        }}
                      />
                    ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {toDelete && (
        <DeleteThoughtRecordDialog
          record={toDelete}
          onClose={() => setToDelete(null)}
          onDone={(message) => {
            setToDelete(null);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}

function DeleteThoughtRecordDialog({
  record,
  onClose,
  onDone,
}: {
  record: ThoughtRecord;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const remove = useDeleteThoughtRecord();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    remove.mutate(record.id, {
      onSuccess: () => onDone('Registro excluído.'),
      // 409: passou o dia do registro. A lista é recarregada e o card fica sem botões.
      onError: (e) => {
        const apiError = getApiError(e);
        if (apiError.status === 409) onDone(apiError.message);
        else setError(apiError.message);
      },
    });
  }

  return (
    <Dialog
      title="Excluir este registro?"
      description="Ele some do seu Registro de Pensamentos, e não dá para desfazer."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={error}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
