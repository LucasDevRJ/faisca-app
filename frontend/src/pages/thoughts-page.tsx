import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { getApiError } from '../features/auth/auth-api';
import { useSession } from '../features/auth/use-session';
import {
  addDays,
  formatDayHeading,
  formatWeekRange,
  isValidDateOnly,
  startOfWeek,
  todayInAppZone,
  weekDays,
} from '../features/activities/week';
import { PrivacyConsentGate } from '../features/thought-records/privacy-consent';
import { ThoughtRecordCard } from '../features/thought-records/thought-record-card';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import {
  needsPrivacyConsent,
  useDeleteThoughtRecord,
  useWeekThoughtRecords,
} from '../features/thought-records/use-thought-records';

// Aviso vindo de outra página (ex.: "Registro salvo."), por navigate(..., { state }).
export type ThoughtsPageState = { notice?: string } | null;

// "Pensamentos": o Registro de Pensamentos do paciente (SPEC, "Registro de Pensamentos"; DEC-040).
// A semana fica na URL (?semana=AAAA-MM-DD), como em /registros (DEC-029).
export function ThoughtsPage() {
  const { data: user } = useSession();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toDelete, setToDelete] = useState<ThoughtRecord | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as ThoughtsPageState)?.notice ?? null);

  const consented = Boolean(user?.privacyUpToDate);
  const today = todayInAppZone();
  const currentMonday = startOfWeek(today);
  const param = searchParams.get('semana');
  const monday = isValidDateOnly(param) ? startOfWeek(param) : currentMonday;
  const week = useWeekThoughtRecords(monday, consented);
  const records = week.data ?? [];
  // Sem registro, o dia não aparece: o RPD não é diário.
  const days = weekDays(monday).filter((day) => records.some((r) => r.situationDate === day));
  // O novo registro sugere hoje ou, numa semana passada, o domingo dela.
  const sunday = addDays(monday, 6);
  const newDate = sunday < today ? sunday : today;

  function goToWeek(target: string) {
    setNotice(null);
    setSearchParams(target === currentMonday ? {} : { semana: target });
  }

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
        <PrivacyConsentGate />
      </>
    );
  }

  return (
    <>
      {header}

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
            {monday !== currentMonday && (
              <Button variant="secondary" onClick={() => goToWeek(currentMonday)}>
                Voltar para esta semana
              </Button>
            )}
            {/* No celular, o botão flutua no canto de baixo, como "Nova atividade". */}
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
          </div>
        </div>

        {notice && <Alert>{notice}</Alert>}

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

        {week.isSuccess && records.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
            Nada anotado nesta semana. Quando algo mexer com você, dá para anotar aqui.
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
