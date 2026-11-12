import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { buttonClasses } from '../components/ui/button-styles';
import { isValidDateOnly, todayInAppZone } from '../features/activities/week';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { PlanEntryForm } from '../features/plans/plan-entry-form';
import { entryLoadError, planLoadError } from '../features/plans/plan-labels';
import type { PlanEntry } from '../features/plans/plans-api';
import { useCreatePlanEntry, usePlan, usePlanEntry, useUpdatePlanEntry } from '../features/plans/use-plans';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';
import type { PlanPageState } from './plan-page';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

function formError(error: unknown): { message: string; fields: Record<string, string> } | null {
  if (!error) return null;
  const { message, fields } = getApiError(error);
  return { message, fields };
}

// O nome do plano no título e "Novo registro" ou "Editar registro" logo abaixo.
function Frame({
  backTo,
  planTitle,
  subtitle,
  children,
}: {
  backTo: string;
  planTitle: string | null;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <>
      <Link to={backTo} className={backLinkClass}>
        ‹ Voltar ao plano
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold break-words sm:text-4xl">{planTitle ?? subtitle}</h1>
        {planTitle && <p className="text-lg font-medium text-muted">{subtitle}</p>}
      </div>
      {children}
    </>
  );
}

// Volta para o período do dia do registro, com o aviso de que deu certo.
function useBackToPlan() {
  const navigate = useNavigate();
  return (entry: PlanEntry, notice: string) => {
    // O ciclo do dia registrado (DEC-050); sem agenda, a tela mostra a semana dele.
    const search = entry.entryDate === todayInAppZone() ? '' : `?ciclo=${entry.entryDate}`;
    const state: PlanPageState = { notice };
    navigate(`/planos/${entry.planId}${search}`, { state });
  };
}

// /planos/:id/registrar (DEC-095). ?dia=AAAA-MM-DD sugere o dia do registro.
export function NewPlanEntryPage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const [searchParams] = useSearchParams();
  const consented = Boolean(user?.privacyAreas.plans);
  const plan = usePlan(id, consented);
  const create = useCreatePlanEntry();
  const backToPlan = useBackToPlan();
  const backTo = `/planos/${id}`;

  const today = todayInAppZone();
  const day = searchParams.get('dia');
  const initialDate = isValidDateOnly(day) && day <= today ? day : today;

  if (!consented || (plan.isError && needsPrivacyConsent(plan.error)) || (create.isError && needsPrivacyConsent(create.error))) {
    return (
      <Frame backTo={backTo} planTitle={null} subtitle="Novo registro">
        <PrivacyConsentGate area="plans" />
      </Frame>
    );
  }

  if (plan.isPending) {
    return (
      <Frame backTo={backTo} planTitle={null} subtitle="Novo registro">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (plan.isError) {
    return (
      <Frame backTo="/planos" planTitle={null} subtitle="Novo registro">
        <Alert tone="attention">{planLoadError(getApiError(plan.error))}</Alert>
      </Frame>
    );
  }

  if (plan.data.archived) {
    return (
      <Frame backTo={backTo} planTitle={plan.data.title} subtitle="Novo registro">
        <Alert tone="attention">Este plano está encerrado. Reabra o plano para registrar.</Alert>
        <Link to={backTo} className={buttonClasses('secondary', 'self-start')}>
          Voltar ao plano
        </Link>
      </Frame>
    );
  }

  return (
    <Frame backTo={backTo} planTitle={plan.data.title} subtitle="Novo registro">
      <PlanEntryForm
        // As perguntas mudaram enquanto a tela estava aberta: o formulário recomeça com as novas.
        key={plan.data.questions.join('\n')}
        questions={plan.data.questions}
        initialDate={initialDate}
        submitLabel="Salvar registro"
        pending={create.isPending}
        apiError={formError(create.error)}
        cancelTo={backTo}
        onSubmit={(input) =>
          create.mutate({ planId: id, input }, { onSuccess: (entry) => backToPlan(entry, 'Registro salvo.') })
        }
      />
    </Frame>
  );
}

// /planos/registros/:entryId/editar (DEC-095). Só no dia em que o registro foi feito; depois, só
// leitura. As perguntas são a cópia do registro, e não as do plano de agora (DEC-094).
export function EditPlanEntryPage() {
  const { entryId = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.plans);
  const entry = usePlanEntry(entryId, consented);
  const update = useUpdatePlanEntry();
  const backToPlan = useBackToPlan();
  const backTo = entry.data ? `/planos/${entry.data.planId}` : '/planos';

  if (!consented || (entry.isError && needsPrivacyConsent(entry.error))) {
    return (
      <Frame backTo="/planos" planTitle={null} subtitle="Editar registro">
        <PrivacyConsentGate area="plans" />
      </Frame>
    );
  }

  if (entry.isPending) {
    return (
      <Frame backTo="/planos" planTitle={null} subtitle="Editar registro">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (entry.isError) {
    return (
      <Frame backTo="/planos" planTitle={null} subtitle="Editar registro">
        <Alert tone="attention">{entryLoadError(getApiError(entry.error))}</Alert>
      </Frame>
    );
  }

  // Passou o dia do registro (aqui ou na API, com 409): fica como está.
  const locked = !entry.data.editable || (update.isError && getApiError(update.error).status === 409);
  if (locked) {
    return (
      <Frame backTo={backTo} planTitle={entry.data.planTitle} subtitle="Editar registro">
        <Alert tone="attention">
          Este registro só podia ser alterado no dia em que foi feito. Ele continua guardado como está.
        </Alert>
        <Link to={backTo} className={buttonClasses('secondary', 'self-start')}>
          Voltar ao plano
        </Link>
      </Frame>
    );
  }

  return (
    <Frame backTo={backTo} planTitle={entry.data.planTitle} subtitle="Editar registro">
      <PlanEntryForm
        questions={entry.data.questions}
        initial={entry.data}
        initialDate={entry.data.entryDate}
        submitLabel="Salvar alterações"
        pending={update.isPending}
        apiError={formError(update.error)}
        cancelTo={backTo}
        onSubmit={(input) =>
          update.mutate({ id: entryId, input }, { onSuccess: (saved) => backToPlan(saved, 'Alterações salvas.') })
        }
      />
    </Frame>
  );
}
