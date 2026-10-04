import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { ActionCard, type ActionCardAction } from '../features/actions/action-card';
import { ActionChart } from '../features/actions/action-chart';
import { DeleteActionDialog, EvaluateActionDialog, NotDoneActionDialog } from '../features/actions/action-dialogs';
import { CATEGORIES, CATEGORY_TEXT } from '../features/actions/action-labels';
import type { Action } from '../features/actions/actions-api';
import { CycleGoal } from '../features/actions/cycle-goal';
import { useRangeActions } from '../features/actions/use-actions';
import { formatDayHeading, todayInAppZone } from '../features/activities/week';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { PeriodNav } from '../features/cycle/period-nav';
import { cycleQuery } from '../features/cycle/use-cycle';
import { usePeriod } from '../features/cycle/use-period';
import { daysInRange } from '../features/therapist/period';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

// Aviso vindo de outra página (ex.: "Ação salva."), por navigate(..., { state }).
export type ActionsPageState = { notice?: string } | null;

type OpenDialog = { kind: ActionCardAction; action: Action } | null;

// Explicação da Ação, recolhida depois da primeira leitura (o <details> guarda o estado na tela).
function AboutActions() {
  return (
    <details className="rounded-lg border border-border bg-surface p-4 shadow-soft">
      <summary className="cursor-pointer font-semibold">O que é a Ação?</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p>
          A cada ciclo, até a próxima consulta, escolha ações de três tipos. Antes, anote o quanto espera gostar.
          Depois, conte como foi. Muitas vezes a gente descobre que foi melhor do que imaginava.
        </p>
        <ul className="flex flex-col gap-2">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <span className="font-semibold">{CATEGORY_TEXT[category].label}:</span>{' '}
              {CATEGORY_TEXT[category].description}{' '}
              <span className="text-muted">{CATEGORY_TEXT[category].examples}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted">Nem sempre dá para fazer tudo, e está tudo bem: o que não deu também fica registrado.</p>
      </div>
    </details>
  );
}

// "Repetir do ciclo passado" (DEC-052): as ações do ciclo anterior viram atalhos para planejar de novo.
function RepeatFromPrevious({ previous, enabled }: { previous: string; enabled: boolean }) {
  const previousCycle = useQuery(cycleQuery(previous)).data?.cycle ?? null;
  const range = previousCycle ?? { from: previous, to: previous };
  const actions = useRangeActions(range, enabled && previousCycle !== null).data ?? [];
  // Uma por nome e tipo, na ordem em que aparecem.
  const unique = actions.filter(
    (a, i) => actions.findIndex((b) => b.name === a.name && b.category === a.category) === i,
  );
  if (unique.length === 0) return null;

  return (
    <section aria-labelledby="repeat-title" className="flex flex-col gap-2">
      <h3 id="repeat-title" className="font-semibold">
        Repetir do ciclo passado
      </h3>
      <ul className="flex flex-wrap gap-2">
        {unique.slice(0, 6).map((action) => (
          <li key={action.id}>
            <Link
              to={`/acao/nova?${new URLSearchParams({ nome: action.name, tipo: action.category })}`}
              className="inline-flex min-h-11 items-center rounded-full border border-border bg-surface px-3 text-sm hover:border-primary"
            >
              {action.name} · {CATEGORY_TEXT[action.category].label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// "Ação": ações de prazer, conexão e realização (SPEC, "Ação"; DEC-051, DEC-052). O período
// (ciclo da consulta ou semana) fica na URL, como nas outras abas (DEC-050).
export function ActionsPage() {
  const { data: user } = useSession();
  const location = useLocation();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [notice, setNotice] = useState<string | null>((location.state as ActionsPageState)?.notice ?? null);

  const consented = Boolean(user?.privacyAreas.actions);
  const today = todayInAppZone();
  const { period, currentMonday, showCycle, showWeek } = usePeriod(cycleQuery, today);
  const range = period ?? { from: today, to: today };
  const inCycle = period?.mode === 'cycle';
  const list = useRangeActions(range, consented && period !== null);
  const actions = list.data ?? [];
  // Sem ação, o dia não aparece.
  const days = daysInRange(range).filter((day) => actions.some((a) => a.actionDate === day));
  // A nova ação sugere hoje ou, num período passado, o último dia dele (a API decide se cabe).
  const newDate = range.to < today ? range.to : today;

  const header = (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold sm:text-4xl">Ação</h1>
      <p className="text-muted sm:text-lg">Pequenas ações de prazer, de conexão e de realização, no seu ritmo.</p>
    </section>
  );

  if (!consented || (list.isError && needsPrivacyConsent(list.error))) {
    return (
      <>
        {header}
        <AboutActions />
        <PrivacyConsentGate area="actions" />
      </>
    );
  }

  function done(message?: string) {
    setDialog(null);
    setNotice(message ?? null);
  }

  return (
    <>
      {header}
      <AboutActions />

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
              // No celular, o botão flutua no canto de baixo, como "Nova atividade".
              <Link
                to={`/acao/nova?dia=${newDate}`}
                className={buttonClasses(
                  'primary',
                  'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-soft sm:static sm:shadow-none',
                )}
              >
                <span aria-hidden="true" className="text-xl leading-none sm:hidden">
                  +
                </span>
                Nova ação
              </Link>
            }
          />
        ) : (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {notice && <Alert>{notice}</Alert>}

        {period && inCycle && list.isSuccess && <CycleGoal actions={actions} range={range} />}

        {period && list.isPending && (
          <p className="text-muted" aria-busy="true">
            Carregando…
          </p>
        )}

        {list.isError && (
          <Alert tone="attention">
            <div className="flex flex-col gap-3">
              <p>Não conseguimos carregar este período. Confira sua conexão e tente de novo.</p>
              <div>
                <Button variant="secondary" onClick={() => list.refetch()}>
                  Tentar de novo
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {list.isSuccess && actions.length === 0 && (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
            Nenhuma ação {inCycle ? 'neste ciclo' : 'nesta semana'} ainda. Que tal escolher uma pequena?
          </p>
        )}

        {list.isSuccess && actions.length > 0 && (
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
                  {actions
                    .filter((a) => a.actionDate === day)
                    .map((action) => (
                      <ActionCard
                        key={action.id}
                        action={action}
                        today={today}
                        onAction={(kind, a) => {
                          setNotice(null);
                          setDialog({ kind, action: a });
                        }}
                      />
                    ))}
                </div>
              </li>
            ))}
          </ol>
        )}

        {period?.cycle?.previous && <RepeatFromPrevious previous={period.cycle.previous} enabled={consented} />}

        {/* O gráfico fica no fim: primeiro o que a pessoa fez, depois os números (como na Tensão). */}
        {list.isSuccess && <ActionChart actions={actions} period={inCycle ? 'no ciclo' : 'na semana'} />}
      </section>

      {dialog?.kind === 'evaluate' && (
        <EvaluateActionDialog action={dialog.action} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'notDone' && (
        <NotDoneActionDialog action={dialog.action} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteActionDialog action={dialog.action} onClose={() => setDialog(null)} onDone={done} />
      )}
    </>
  );
}
