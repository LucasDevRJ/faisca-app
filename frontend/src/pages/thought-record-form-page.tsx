import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { buttonClasses } from '../components/ui/button-styles';
import { getApiError, type ApiErrorInfo } from '../features/auth/auth-api';
import { useSession } from '../features/auth/use-session';
import { isValidDateOnly, todayInAppZone } from '../features/activities/week';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { ThoughtRecordForm } from '../features/thought-records/thought-record-form';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import {
  needsPrivacyConsent,
  useCreateThoughtRecord,
  useThoughtRecord,
  useUpdateThoughtRecord,
} from '../features/thought-records/use-thought-records';
import type { ThoughtsPageState } from './thoughts-page';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

// Volta para o período do dia da situação, com o aviso de que deu certo.
function useBackToWeek() {
  const navigate = useNavigate();
  return (record: ThoughtRecord, notice: string) => {
    // O ciclo do dia registrado (DEC-050); sem agenda, a tela mostra a semana dele.
    const search = record.situationDate === todayInAppZone() ? '' : `?ciclo=${record.situationDate}`;
    const state: ThoughtsPageState = { notice };
    navigate(`/pensamentos${search}`, { state });
  };
}

function formError(error: unknown): { message: string; fields: Record<string, string> } | null {
  if (!error) return null;
  const { message, fields } = getApiError(error);
  return { message, fields };
}

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <Link to="/pensamentos" className={backLinkClass}>
        ‹ Registro de Pensamentos
      </Link>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {children}
    </>
  );
}

// /pensamentos/novo (DEC-040). ?dia=AAAA-MM-DD sugere o dia da situação.
export function NewThoughtRecordPage() {
  const { data: user } = useSession();
  const [searchParams] = useSearchParams();
  const create = useCreateThoughtRecord();
  const backToWeek = useBackToWeek();

  const today = todayInAppZone();
  const day = searchParams.get('dia');
  const initialDate = isValidDateOnly(day) && day <= today ? day : today;

  if (!user?.privacyAreas.thoughtRecords || (create.isError && needsPrivacyConsent(create.error))) {
    return (
      <Frame title="Novo registro">
        <PrivacyConsentGate area="thoughtRecords" />
      </Frame>
    );
  }

  return (
    <Frame title="Novo registro">
      <ThoughtRecordForm
        initialDate={initialDate}
        submitLabel="Salvar registro"
        pending={create.isPending}
        apiError={formError(create.error)}
        cancelTo="/pensamentos"
        onSubmit={(input) => create.mutate(input, { onSuccess: (record) => backToWeek(record, 'Registro salvo.') })}
      />
    </Frame>
  );
}

// /pensamentos/:id/editar (DEC-040). Só no dia em que o registro foi feito; depois, só leitura.
export function EditThoughtRecordPage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.thoughtRecords);
  const record = useThoughtRecord(id, consented);
  const update = useUpdateThoughtRecord();
  const backToWeek = useBackToWeek();

  if (!consented || (record.isError && needsPrivacyConsent(record.error))) {
    return (
      <Frame title="Editar registro">
        <PrivacyConsentGate area="thoughtRecords" />
      </Frame>
    );
  }

  if (record.isPending) {
    return (
      <Frame title="Editar registro">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (record.isError) {
    return (
      <Frame title="Editar registro">
        <Alert tone="attention">{loadErrorMessage(getApiError(record.error))}</Alert>
      </Frame>
    );
  }

  // Passou o dia do registro (aqui ou na API, com 409): fica como está.
  const locked = !record.data.editable || (update.isError && getApiError(update.error).status === 409);
  if (locked) {
    return (
      <Frame title="Editar registro">
        <Alert tone="attention">
          Este registro só podia ser alterado no dia em que foi feito. Ele continua guardado como está.
        </Alert>
        <Link to="/pensamentos" className={buttonClasses('secondary', 'self-start')}>
          Voltar para o Registro de Pensamentos
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title="Editar registro">
      <ThoughtRecordForm
        initial={record.data}
        initialDate={record.data.situationDate}
        submitLabel="Salvar alterações"
        pending={update.isPending}
        apiError={formError(update.error)}
        cancelTo="/pensamentos"
        onSubmit={(input) =>
          update.mutate({ id, input }, { onSuccess: (saved) => backToWeek(saved, 'Alterações salvas.') })
        }
      />
    </Frame>
  );
}

function loadErrorMessage(error: ApiErrorInfo): string {
  if (error.status === 404 || error.status === 400) return 'Não encontramos este registro.';
  if (error.status === 403) return 'Você não tem acesso a este registro.';
  return error.message;
}
