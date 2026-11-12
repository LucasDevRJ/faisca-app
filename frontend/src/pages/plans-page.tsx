import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { Dialog, DialogActions, DialogForm } from '../components/ui/dialog';
import { formatDayMonth } from '../features/activities/week';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import type { Plan } from '../features/plans/plans-api';
import { useDeletePlan, usePlans, useUpdatePlan } from '../features/plans/use-plans';
import { useAccessibility } from '../features/profile/use-profile';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';

// Aviso vindo de outra página (ex.: "Plano criado."), por navigate(..., { state }).
export type PlansPageState = { notice?: string } | null;

type PlanAction = { kind: 'archive' | 'delete'; plan: Plan };

// "Meus Planos": os planos de ação do paciente (SPEC, "Meus Planos"; DEC-094, DEC-095).
export function PlansPage() {
  const { data: user } = useSession();
  const location = useLocation();
  const { directLanguage } = useAccessibility();
  const [notice, setNotice] = useState<string | null>((location.state as PlansPageState)?.notice ?? null);
  const [action, setAction] = useState<PlanAction | null>(null);
  const consented = Boolean(user?.privacyAreas.plans);
  const plans = usePlans(consented);
  const reopen = useUpdatePlan();

  const header = (
    <section className="flex flex-col gap-2">
      <h1 className="text-3xl font-bold sm:text-4xl">Meus Planos</h1>
      <p className="text-muted sm:text-lg">
        {directLanguage
          ? 'Cada plano tem perguntas. Quando a situação do plano acontecer, faça um registro e responda às perguntas.'
          : 'Planos de ação para entender um momento que se repete. Toda vez que ele acontecer, registre aqui e responda às perguntas do plano.'}
      </p>
    </section>
  );

  if (!consented || (plans.isError && needsPrivacyConsent(plans.error))) {
    return (
      <>
        {header}
        <PrivacyConsentGate area="plans" />
      </>
    );
  }

  const active = (plans.data ?? []).filter((plan) => !plan.archived);
  const archived = (plans.data ?? []).filter((plan) => plan.archived);

  return (
    <>
      {header}
      <AboutPlans directLanguage={directLanguage} />

      <Link to="/planos/novo" className={buttonClasses('primary', 'self-start')}>
        Novo plano
      </Link>

      {notice && <Alert>{notice}</Alert>}

      {plans.isPending && (
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      )}

      {plans.isError && (
        <Alert tone="attention">
          <div className="flex flex-col gap-3">
            <p>Não conseguimos carregar os seus planos. Confira sua conexão e tente de novo.</p>
            <div>
              <Button variant="secondary" onClick={() => plans.refetch()}>
                Tentar de novo
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {plans.isSuccess && active.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-muted">
          Nenhum plano ativo. Quando combinar um plano de ação com a sua psicóloga, crie aqui.
        </p>
      )}

      {active.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label="Planos ativos">
          {active.map((plan) => (
            <li key={plan.id}>
              <PlanCard
                plan={plan}
                onArchive={() => {
                  setNotice(null);
                  setAction({ kind: 'archive', plan });
                }}
                onDelete={() => {
                  setNotice(null);
                  setAction({ kind: 'delete', plan });
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border border-border bg-surface p-4 shadow-soft">
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            Planos encerrados ({archived.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {archived.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-col gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
              >
                <p className="font-medium break-words">{plan.title}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    disabled={reopen.isPending}
                    onClick={() => {
                      setNotice(null);
                      reopen.mutate(
                        { id: plan.id, input: { archived: false } },
                        {
                          onSuccess: () => setNotice('Plano reaberto.'),
                          onError: (e) => setNotice(getApiError(e).message),
                        },
                      );
                    }}
                  >
                    Reabrir<span className="sr-only"> o plano {plan.title}</span>
                  </Button>
                  <Link to={`/planos/${plan.id}`} className={buttonClasses('ghost', 'px-3')}>
                    Ver registros<span className="sr-only"> do plano {plan.title}</span>
                  </Link>
                  {!plan.hasEntries && (
                    <Button
                      variant="ghost"
                      className="px-3"
                      onClick={() => {
                        setNotice(null);
                        setAction({ kind: 'delete', plan });
                      }}
                    >
                      Apagar<span className="sr-only"> o plano {plan.title}</span>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {action && (
        <PlanActionDialog
          action={action}
          onClose={() => setAction(null)}
          onDone={(message) => {
            setAction(null);
            setNotice(message);
          }}
        />
      )}
    </>
  );
}

// Explicação, recolhida depois da primeira leitura (o <details> guarda o estado na tela).
function AboutPlans({ directLanguage }: { directLanguage: boolean }) {
  return (
    <details className="rounded-lg border border-border bg-surface p-4 shadow-soft">
      <summary className="min-h-11 cursor-pointer content-center font-semibold">Como funciona um plano?</summary>
      <p className="mt-3">
        {directLanguage
          ? 'O nome do plano diz quando registrar. Por exemplo: “Quando surgir vontade de rolar o celular sem parar”. As perguntas são sobre o que aconteceu antes, durante e depois. Você pode deixar perguntas sem resposta. Sua psicóloga lê os registros e conversa com você sobre eles na consulta.'
          : 'O nome do plano diz quando registrar, por exemplo: “Quando surgir vontade de rolar o celular sem parar”. As perguntas ajudam a olhar com calma para o que aconteceu antes, durante e depois. Não existe resposta certa: responda o que conseguir. Sua psicóloga vê os registros e conversa com você sobre eles na consulta.'}
      </p>
    </details>
  );
}

function PlanCard({ plan, onArchive, onDelete }: { plan: Plan; onArchive: () => void; onDelete: () => void }) {
  const titleId = `plan-${plan.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-soft"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-lg font-semibold break-words">
          {plan.title}
        </h2>
        <p className="text-sm text-muted">
          {plan.lastEntryDate ? `Último registro: ${formatDayMonth(plan.lastEntryDate)}` : 'Ainda sem registros'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Link to={`/planos/${plan.id}/registrar`} className={buttonClasses('primary')}>
          Registrar<span className="sr-only"> no plano {plan.title}</span>
        </Link>
        <Link to={`/planos/${plan.id}`} className={buttonClasses('secondary')}>
          Ver registros<span className="sr-only"> do plano {plan.title}</span>
        </Link>
      </div>
      <div className="flex flex-wrap gap-1">
        <Link to={`/planos/${plan.id}/editar`} className={buttonClasses('ghost', 'px-3')}>
          Editar plano<span className="sr-only"> {plan.title}</span>
        </Link>
        <Button variant="ghost" className="px-3" onClick={onArchive}>
          Encerrar plano<span className="sr-only"> {plan.title}</span>
        </Button>
        {!plan.hasEntries && (
          <Button variant="ghost" className="px-3" onClick={onDelete}>
            Apagar plano<span className="sr-only"> {plan.title}</span>
          </Button>
        )}
      </div>
    </article>
  );
}

// Encerrar ou apagar, sempre com confirmação. Apagar só aparece sem registros; se um registro
// entrou no meio do caminho, a API responde 409 e a mensagem dela sugere encerrar.
function PlanActionDialog({
  action,
  onClose,
  onDone,
}: {
  action: PlanAction;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const update = useUpdatePlan();
  const remove = useDeletePlan();
  const [error, setError] = useState<string | null>(null);
  const archiving = action.kind === 'archive';

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const onError = (e: unknown) => setError(getApiError(e).message);
    if (archiving) {
      update.mutate(
        { id: action.plan.id, input: { archived: true } },
        { onSuccess: () => onDone('Plano encerrado. Os registros continuam guardados.'), onError },
      );
    } else {
      remove.mutate(action.plan.id, { onSuccess: () => onDone('Plano apagado.'), onError });
    }
  }

  return (
    <Dialog
      title={archiving ? 'Encerrar este plano?' : 'Apagar este plano?'}
      description={
        archiving
          ? 'Ele sai da lista e não recebe novos registros. Os registros continuam guardados, e dá para reabrir quando quiser.'
          : 'Ele ainda não tem registros. Não dá para desfazer.'
      }
      onClose={onClose}
    >
      <DialogForm onSubmit={handleSubmit} error={error}>
        <DialogActions
          submitLabel={archiving ? 'Encerrar' : 'Apagar'}
          pending={update.isPending || remove.isPending}
          onCancel={onClose}
        />
      </DialogForm>
    </Dialog>
  );
}
