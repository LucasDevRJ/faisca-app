import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { formatDayHeading, todayInAppZone } from '../features/activities/week';
import { PatientCycleSummary } from '../features/cycle/cycle-summary';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod } from '../features/cycle/use-period';
import { daysInRange } from '../features/therapist/period';
import { sessionDays } from '../features/appointments/appointments-api';
import { useAgenda } from '../features/appointments/use-appointments';
import { TensionChart } from '../features/tension-episodes/tension-chart';
import { TensionEpisodeCard } from '../features/tension-episodes/tension-episode-card';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import { useDeleteTensionEpisode, useRangeTensionEpisodes } from '../features/tension-episodes/use-tension-episodes';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

// Aviso vindo de outra página (ex.: "Registro salvo."), por navigate(..., { state }).
export type TensionPageState = { notice?: string } | null;

// "Tensão": os Episódios de tensão do paciente (SPEC, "Episódios de tensão"; DEC-043).
// O período (ciclo da consulta ou semana) fica na URL, como em /registros (DEC-050).
export function TensionPage() {
  const { data: user } = useSession();
  const location = useLocation();
  const [toDelete, setToDelete] = useState<TensionEpisode | null>(null);
  const [notice, setNotice] = useState<string | null>((location.state as TensionPageState)?.notice ?? null);

  const consented = Boolean(user?.privacyAreas.tensionEpisodes);
  const today = todayInAppZone();
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const range = period ?? { from: today, to: today };
  const inCycle = period?.mode === 'cycle';
  const week = useRangeTensionEpisodes(range, consented && period !== null);
  const appointmentDays = sessionDays(useAgenda(range).data);
  const episodes = week.data ?? [];
  // Sem episódio, o dia não aparece.
  const days = daysInRange(range).filter((day) => episodes.some((e) => e.episodeDate === day));
  // O novo registro sugere hoje ou, num período passado, o último dia dele.
  const newDate = range.to < today ? range.to : today;

  const header = (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold sm:text-4xl">Episódios de tensão</h1>
      <p className="text-muted sm:text-lg">
        Quando a tensão aparecer, anote o que estava acontecendo, o quanto ficou tenso, a vontade de vocalizar, o
        que fez e o que veio depois.
      </p>
    </section>
  );

  if (!consented || (week.isError && needsPrivacyConsent(week.error))) {
    return (
      <>
        {header}
        <PrivacyConsentGate area="tensionEpisodes" />
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
                to={`/tensao/novo?dia=${newDate}`}
                className={buttonClasses(
                  'primary',
                  'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none',
                )}
              >
                <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                  +
                </span>
                Novo episódio
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

        {week.isSuccess && episodes.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
            Nenhum episódio {inCycle ? 'neste ciclo' : 'nesta semana'}. Quando a tensão aparecer, dá para anotar aqui.
          </p>
        )}

        {week.isSuccess && episodes.length > 0 && (
          <>
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
                    {episodes
                      .filter((e) => e.episodeDate === day)
                      .map((episode) => (
                        <TensionEpisodeCard
                          key={episode.id}
                          episode={episode}
                          onDelete={(e) => {
                            setNotice(null);
                            setToDelete(e);
                          }}
                        />
                      ))}
                  </div>
                </li>
              ))}
            </ol>

            {/* O gráfico fica no fim: primeiro o que a pessoa escreveu, depois os números (DEC-043). */}
            <TensionChart
              episodes={episodes}
              range={range}
              appointmentDays={appointmentDays}
              period={inCycle ? 'no ciclo' : 'na semana'}
            />
          </>
        )}
      </section>

      {toDelete && (
        <DeleteTensionEpisodeDialog
          episode={toDelete}
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

function DeleteTensionEpisodeDialog({
  episode,
  onClose,
  onDone,
}: {
  episode: TensionEpisode;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const remove = useDeleteTensionEpisode();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    remove.mutate(episode.id, {
      onSuccess: () => onDone('Episódio excluído.'),
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
      title="Excluir este episódio?"
      description="Ele some dos seus Episódios de tensão, e não dá para desfazer."
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={error}>
        <DialogActions submitLabel="Excluir" pending={remove.isPending} onCancel={onClose} />
      </DialogForm>
    </Dialog>
  );
}
