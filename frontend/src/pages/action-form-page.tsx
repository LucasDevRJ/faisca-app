import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { buttonClasses } from '../components/ui/button-styles';
import { ActionForm } from '../features/actions/action-form';
import { CATEGORIES } from '../features/actions/action-labels';
import type { Action, ActionCategory } from '../features/actions/actions-api';
import { useAction, useCreateAction, useUpdateAction } from '../features/actions/use-actions';
import { isValidDateOnly, todayInAppZone } from '../features/activities/week';
import { getApiError } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';
import type { ActionsPageState } from './actions-page';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

// Volta para o ciclo do dia da ação, com o aviso de que deu certo (DEC-050).
function useBackToPeriod() {
  const navigate = useNavigate();
  return (action: Action, notice: string) => {
    const search = action.actionDate === todayInAppZone() ? '' : `?ciclo=${action.actionDate}`;
    const state: ActionsPageState = { notice };
    navigate(`/acao${search}`, { state });
  };
}

function formError(error: unknown) {
  if (!error) return null;
  const { message, fields } = getApiError(error);
  return { message, fields };
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Link to="/acao" className={backLinkClass}>
        ‹ Ação
      </Link>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {children}
    </>
  );
}

// /acao/nova (DEC-052). ?dia=AAAA-MM-DD sugere o dia; ?nome= e ?tipo= vêm do "Repetir do ciclo passado".
export function NewActionPage() {
  const { data: user } = useSession();
  const [searchParams] = useSearchParams();
  const create = useCreateAction();
  const back = useBackToPeriod();

  const today = todayInAppZone();
  const day = searchParams.get('dia');
  const type = searchParams.get('tipo');
  const initial = {
    actionDate: isValidDateOnly(day) && day >= today ? day : today,
    name: searchParams.get('nome')?.slice(0, 100) ?? '',
    category: CATEGORIES.includes(type as ActionCategory) ? (type as ActionCategory) : undefined,
  };

  if (!user?.privacyAreas.actions || (create.isError && needsPrivacyConsent(create.error))) {
    return (
      <Frame title="Nova ação">
        <PrivacyConsentGate area="actions" />
      </Frame>
    );
  }

  return (
    <Frame title="Nova ação">
      <ActionForm
        today={today}
        initial={initial}
        submitLabel="Salvar ação"
        pending={create.isPending}
        apiError={formError(create.error)}
        cancelTo="/acao"
        onSubmit={(input) => create.mutate(input, { onSuccess: (action) => back(action, 'Ação salva.') })}
      />
    </Frame>
  );
}

// /acao/:id/editar (DEC-052). Só a planejada; avaliada e não realizada são finais (DEC-051).
export function EditActionPage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.actions);
  const action = useAction(id, consented);
  const update = useUpdateAction();
  const back = useBackToPeriod();

  if (!consented || (action.isError && needsPrivacyConsent(action.error))) {
    return (
      <Frame title="Editar ação">
        <PrivacyConsentGate area="actions" />
      </Frame>
    );
  }

  if (action.isPending) {
    return (
      <Frame title="Editar ação">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (action.isError) {
    const { status } = getApiError(action.error);
    return (
      <Frame title="Editar ação">
        <Alert tone="attention">
          {status === 404 || status === 403 ? 'Não encontramos esta ação.' : 'Não conseguimos carregar a ação. Tente de novo.'}
        </Alert>
      </Frame>
    );
  }

  const final = action.data.status !== 'PLANEJADA' || (update.isError && getApiError(update.error).status === 409);
  if (final) {
    return (
      <Frame title="Editar ação">
        <Alert tone="attention">Esta ação já foi avaliada ou marcada como não realizada. Ela continua guardada como está.</Alert>
        <Link to="/acao" className={buttonClasses('secondary', 'self-start')}>
          Voltar para a Ação
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title="Editar ação">
      <ActionForm
        today={todayInAppZone()}
        initial={action.data}
        editing
        submitLabel="Salvar alterações"
        pending={update.isPending}
        apiError={formError(update.error)}
        cancelTo="/acao"
        onSubmit={(input) =>
          update.mutate(
            {
              id,
              input: { actionDate: input.actionDate, name: input.name, category: input.category, expectation: input.expectation },
            },
            { onSuccess: (saved) => back(saved, 'Alterações salvas.') },
          )
        }
      />
    </Frame>
  );
}
