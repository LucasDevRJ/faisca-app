import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { LongText } from '../components/ui/long-text';
import { getApiError, type ApiErrorInfo } from '../features/auth/auth-api';
import { useSession } from '../features/auth/use-session';
import { isValidDateOnly, todayInAppZone } from '../features/activities/week';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { AlternativeFields } from '../features/thought-records/alternative-fields';
import {
  emotionsAfter,
  initialAlternativeState,
  validateAlternative,
} from '../features/thought-records/alternative-state';
import { ThoughtRecordForm } from '../features/thought-records/thought-record-form';
import {
  emotionName,
  FIELD_TEXT,
  formatAlternativeDeadline,
} from '../features/thought-records/thought-record-labels';
import type { ThoughtRecord } from '../features/thought-records/thought-records-api';
import {
  needsPrivacyConsent,
  useAddAlternative,
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

// /pensamentos/:id/alternativa (DEC-055): a explicação alternativa depois do dia do registro, uma
// vez só, até a hora da próxima consulta. No topo, a situação e o pensamento, para quem volta dias
// depois lembrar do que está respondendo.
export function AddAlternativePage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.thoughtRecords);
  const record = useThoughtRecord(id, consented);
  const add = useAddAlternative();
  const backToWeek = useBackToWeek();
  const title = 'Explicação alternativa';

  if (!consented || (record.isError && needsPrivacyConsent(record.error))) {
    return (
      <Frame title={title}>
        <PrivacyConsentGate area="thoughtRecords" />
      </Frame>
    );
  }

  if (record.isPending) {
    return (
      <Frame title={title}>
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (record.isError) {
    return (
      <Frame title={title}>
        <Alert tone="attention">{loadErrorMessage(getApiError(record.error))}</Alert>
      </Frame>
    );
  }

  const data = record.data;
  // No dia do registro, a alternativa vai pelo formulário de edição.
  if (data.editable) {
    return (
      <Frame title={title}>
        <p>Este registro ainda é de hoje: dá para escrever a explicação alternativa no próprio registro.</p>
        <Link to={`/pensamentos/${data.id}/editar`} className={buttonClasses('primary', 'self-start')}>
          Editar registro
        </Link>
      </Frame>
    );
  }

  // A API também recusa com 409 (já tem, prazo encerrado ou sem consulta): a mensagem dela explica.
  const conflict = add.isError && getApiError(add.error).status === 409 ? getApiError(add.error).message : null;
  if (!data.canAddAlternative || !data.alternativeDeadline || conflict) {
    return (
      <Frame title={title}>
        <Alert tone="attention">{conflict ?? unavailableMessage(data)}</Alert>
        <Link to="/pensamentos" className={buttonClasses('secondary', 'self-start')}>
          Voltar para o Registro de Pensamentos
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title={title}>
      <dl className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 shadow-soft sm:p-4">
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-muted">{FIELD_TEXT.situation.label}</dt>
          <dd>
            <LongText text={data.situation} />
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-sm font-medium text-muted">{FIELD_TEXT.automaticThought.label}</dt>
          <dd>
            <LongText text={data.automaticThought} />
          </dd>
        </div>
      </dl>
      <p className="text-muted">
        Você pode adicionar a explicação alternativa uma vez, {formatAlternativeDeadline(data.alternativeDeadline)}.
        Depois de salva, ela fica como está.
      </p>
      <AddAlternativeForm
        record={data}
        pending={add.isPending}
        apiError={formError(add.error)}
        onSubmit={(input) =>
          add.mutate({ id, input }, { onSuccess: (saved) => backToWeek(saved, 'Explicação alternativa adicionada.') })
        }
      />
    </Frame>
  );
}

function unavailableMessage(record: ThoughtRecord): string {
  if (record.alternativeExplanation !== null) return 'Este registro já tem uma explicação alternativa.';
  if (record.alternativeDeadline === null) {
    return 'Agende sua próxima consulta para poder adicionar a explicação alternativa.';
  }
  return 'Não dá mais para adicionar a explicação alternativa a este registro. Ele continua guardado como está.';
}

function AddAlternativeForm({
  record,
  pending,
  apiError,
  onSubmit,
}: {
  record: ThoughtRecord;
  pending: boolean;
  apiError: { message: string; fields: Record<string, string> } | null;
  onSubmit: (input: { alternativeExplanation: string; emotionsAfter?: ReturnType<typeof emotionsAfter> }) => void;
}) {
  const [state, setState] = useState(() => initialAlternativeState());
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const emotions = record.emotions.map((e) => e.emotion);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = validateAlternative(state, emotions);
    if (!state.text.trim()) next.alternativeExplanation = 'Escreva a explicação alternativa.';
    setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    onSubmit({ alternativeExplanation: state.text.trim(), emotionsAfter: emotionsAfter(state, emotions) });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {apiError && <Alert tone="attention">{apiError.message}</Alert>}
      <AlternativeFields
        state={state}
        onChange={setState}
        emotions={record.emotions.map((e) => ({ emotion: e.emotion, name: emotionName(e), before: e.intensity }))}
        error={(key) => errors[key] ?? apiError?.fields[key]}
        optional={false}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar explicação alternativa'}
        </Button>
        <Link to="/pensamentos" className={buttonClasses('secondary')}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function loadErrorMessage(error: ApiErrorInfo): string {
  if (error.status === 404 || error.status === 400) return 'Não encontramos este registro.';
  if (error.status === 403) return 'Você não tem acesso a este registro.';
  return error.message;
}
