import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { PlanForm } from '../features/plans/plan-form';
import { planLoadError } from '../features/plans/plan-labels';
import { useCreatePlan, usePlan, useUpdatePlan } from '../features/plans/use-plans';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';
import type { PlansPageState } from './plans-page';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

function formError(error: unknown): { message: string; fields: Record<string, string> } | null {
  if (!error) return null;
  const { message, fields } = getApiError(error);
  return { message, fields };
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Link to="/planos" className={backLinkClass}>
        ‹ Meus Planos
      </Link>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {children}
    </>
  );
}

function useBackToPlans() {
  const navigate = useNavigate();
  return (notice: string) => {
    const state: PlansPageState = { notice };
    navigate('/planos', { state });
  };
}

// /planos/novo (DEC-095).
export function NewPlanPage() {
  const { data: user } = useSession();
  const create = useCreatePlan();
  const backToPlans = useBackToPlans();

  if (!user?.privacyAreas.plans || (create.isError && needsPrivacyConsent(create.error))) {
    return (
      <Frame title="Novo plano">
        <PrivacyConsentGate area="plans" />
      </Frame>
    );
  }

  return (
    <Frame title="Novo plano">
      <PlanForm
        submitLabel="Criar plano"
        pending={create.isPending}
        apiError={formError(create.error)}
        cancelTo="/planos"
        onSubmit={(input) => create.mutate(input, { onSuccess: () => backToPlans('Plano criado.') })}
      />
    </Frame>
  );
}

// /planos/:id/editar (DEC-095). Mudar as perguntas vale para os próximos registros (DEC-094).
export function EditPlanPage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.plans);
  const plan = usePlan(id, consented);
  const update = useUpdatePlan();
  const backToPlans = useBackToPlans();

  if (!consented || (plan.isError && needsPrivacyConsent(plan.error))) {
    return (
      <Frame title="Editar plano">
        <PrivacyConsentGate area="plans" />
      </Frame>
    );
  }

  if (plan.isPending) {
    return (
      <Frame title="Editar plano">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (plan.isError) {
    return (
      <Frame title="Editar plano">
        <Alert tone="attention">{planLoadError(getApiError(plan.error))}</Alert>
      </Frame>
    );
  }

  return (
    <Frame title="Editar plano">
      <PlanForm
        initial={plan.data}
        submitLabel="Salvar alterações"
        pending={update.isPending}
        apiError={formError(update.error)}
        cancelTo="/planos"
        onSubmit={(input) => update.mutate({ id, input }, { onSuccess: () => backToPlans('Alterações salvas.') })}
      />
    </Frame>
  );
}
