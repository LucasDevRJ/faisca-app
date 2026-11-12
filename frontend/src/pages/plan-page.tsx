import { useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { formatDayHeading, todayInAppZone } from '../features/activities/week';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod } from '../features/cycle/use-period';
import { PlanEntryCard } from '../features/plans/plan-entry-card';
import { planLoadError } from '../features/plans/plan-labels';
import type { PlanEntry } from '../features/plans/plans-api';
import { useDeletePlanEntry, usePlan, usePlanEntries, useUpdatePlan } from '../features/plans/use-plans';
import { daysInRange } from '../features/therapist/period';
import { useAccessibility } from '../features/profile/use-profile';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

// Aviso vindo de outra página (ex.: "Registro salvo."), por navigate(..., { state }).
export type PlanPageState = { notice?: string } | null;

// /planos/:id: os registros de um plano por ciclo ou semana (DEC-095), como a Tensão (DEC-050).
export function PlanPage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>((location.state as PlanPageState)?.notice ?? null);
  const [toDelete, setToDelete] = useState<PlanEntry | null>(null);
  const consented = Boolean(user?.privacyAreas.plans);
  const plan = usePlan(id, consented);
  const reopen = useUpdatePlan();

  const today = todayInAppZone();
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const range = period ?? { from: today, to: today };
  const inCycle = period?.mode === 'cycle';
  const entries = usePlanEntries(id, consented && plan.isSuccess && period !== null ? range : null);
  const list = entries.data ?? [];
  // Sem registro, o dia não aparece.
  const days = daysInRange(range).filter((day) => list.some((entry) => entry.entryDate === day));
  const newDate = range.to < today ? range.to : today;

  const back = (
    <Link to="/planos" className={backLinkClass}>
      ‹ Meus Planos
    </Link>
  );

  if (!consented || (plan.isError && needsPrivacyConsent(plan.error))) {
    return (
      <>
        {back}
        <PrivacyConsentGate area="plans" />
      </>
    );
  }

  if (plan.isPending) {
    return (
      <>
        {back}
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </>
    );
  }

  if (plan.isError) {
    return (
      <>
        {back}
        <Alert tone="attention">{planLoadError(getApiError(plan.error))}</Alert>
      </>
    );
  }

  const current = plan.data;

  return (
    <>
      {back}
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold break-words sm:text-4xl">{current.title}</h1>
        <details>
          <summary className="min-h-11 cursor-pointer content-center font-medium text-primary-text">
            Perguntas do plano
          </summary>
          <ol className="mt-1 flex list-decimal flex-col gap-1 pl-6">
            {current.questions.map((question, index) => (
              <li key={index} className="break-words">
                {question}
              </li>
            ))}
          </ol>
        </details>
      </section>

      {current.archived && (
        <Alert>
          <div className="flex flex-col gap-3">
            <p>Este plano está encerrado. Os registros continuam aqui; para registrar de novo, reabra o plano.</p>
            <div>
              <Button
                variant="secondary"
                disabled={reopen.isPending}
                onClick={() =>
                  reopen.mutate(
                    { id: current.id, input: { archived: false } },
                    { onSuccess: () => setNotice('Plano reaberto.'), onError: (e) => setNotice(getApiError(e).message) },
                  )
                }
              >
                Reabrir o plano
              </Button>
            </div>
          </div>
        </Alert>
      )}

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
            actions={
              current.archived ? undefined : (
                // No celular, o botão flutua no canto de baixo, como "Novo episódio".
                <Link
                  to={`/planos/${current.id}/registrar?dia=${newDate}`}
                  className={buttonClasses(
                    'primary',
                    'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none',
                  )}
                >
                  <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                    +
                  </span>
                  Registrar
                </Link>
              )
            }
          />
        ) : (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {notice && <Alert>{notice}</Alert>}

        {period && entries.isPending && (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {entries.isError && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
              <div>
                <Button variant="secondary" onClick={() => entries.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {entries.isSuccess && list.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
            Nenhum registro {inCycle ? 'neste ciclo' : 'nesta semana'}. Quando acontecer, dá para registrar aqui.
          </p>
        )}

        {entries.isSuccess && list.length > 0 && (
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
                  {list
                    .filter((entry) => entry.entryDate === day)
                    .map((entry) => (
                      <PlanEntryCard
                        key={entry.id}
                        entry={entry}
                        onDelete={(target) => {
                          setNotice(null);
                          setToDelete(target);
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
        <DeletePlanEntryDialog
          entry={toDelete}
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

function DeletePlanEntryDialog({
  entry,
  onClose,
  onDone,
}: {
  entry: PlanEntry;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const remove = useDeletePlanEntry();
  const { directLanguage } = useAccessibility();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    remove.mutate(entry.id, {
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
      description={
        directLanguage
          ? 'Ele é apagado deste plano, e não dá para desfazer.'
          : 'Ele some deste plano, e não dá para desfazer.'
      }
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={error}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
