import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert } from '../components/ui/alert';
import { buttonClasses } from '../components/ui/button-styles';
import { getApiError, type ApiErrorInfo } from '../features/auth/auth-api';
import { PrivacyConsentGate } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { isValidDateOnly, todayInAppZone } from '../features/activities/week';
import { TensionEpisodeForm } from '../features/tension-episodes/tension-episode-form';
import type { TensionEpisode } from '../features/tension-episodes/tension-episodes-api';
import {
  useCreateTensionEpisode,
  useTensionEpisode,
  useUpdateTensionEpisode,
} from '../features/tension-episodes/use-tension-episodes';
import { needsPrivacyConsent } from '../features/thought-records/use-thought-records';
import type { TensionPageState } from './tension-page';

const backLinkClass = 'self-start font-medium text-primary-text underline underline-offset-4';

// Volta para o período do dia do episódio, com o aviso de que deu certo.
function useBackToWeek() {
  const navigate = useNavigate();
  return (episode: TensionEpisode, notice: string) => {
    // O ciclo do dia registrado (DEC-050); sem agenda, a tela mostra a semana dele.
    const search = episode.episodeDate === todayInAppZone() ? '' : `?ciclo=${episode.episodeDate}`;
    const state: TensionPageState = { notice };
    navigate(`/tensao${search}`, { state });
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
      <Link to="/tensao" className={backLinkClass}>
        ‹ Episódios de tensão
      </Link>
      <h1 className="text-3xl font-bold sm:text-4xl">{title}</h1>
      {children}
    </>
  );
}

// /tensao/novo (DEC-043). ?dia=AAAA-MM-DD sugere o dia do episódio.
export function NewTensionEpisodePage() {
  const { data: user } = useSession();
  const [searchParams] = useSearchParams();
  const create = useCreateTensionEpisode();
  const backToWeek = useBackToWeek();

  const today = todayInAppZone();
  const day = searchParams.get('dia');
  const initialDate = isValidDateOnly(day) && day <= today ? day : today;

  if (!user?.privacyAreas.tensionEpisodes || (create.isError && needsPrivacyConsent(create.error))) {
    return (
      <Frame title="Novo episódio">
        <PrivacyConsentGate area="tensionEpisodes" />
      </Frame>
    );
  }

  return (
    <Frame title="Novo episódio">
      <TensionEpisodeForm
        initialDate={initialDate}
        submitLabel="Salvar episódio"
        pending={create.isPending}
        apiError={formError(create.error)}
        cancelTo="/tensao"
        onSubmit={(input) => create.mutate(input, { onSuccess: (episode) => backToWeek(episode, 'Registro salvo.') })}
      />
    </Frame>
  );
}

// /tensao/:id/editar (DEC-043). Só no dia em que o registro foi feito; depois, só leitura.
export function EditTensionEpisodePage() {
  const { id = '' } = useParams();
  const { data: user } = useSession();
  const consented = Boolean(user?.privacyAreas.tensionEpisodes);
  const episode = useTensionEpisode(id, consented);
  const update = useUpdateTensionEpisode();
  const backToWeek = useBackToWeek();

  if (!consented || (episode.isError && needsPrivacyConsent(episode.error))) {
    return (
      <Frame title="Editar episódio">
        <PrivacyConsentGate area="tensionEpisodes" />
      </Frame>
    );
  }

  if (episode.isPending) {
    return (
      <Frame title="Editar episódio">
        <p className="text-muted" aria-busy="true">
          Carregando…
        </p>
      </Frame>
    );
  }

  if (episode.isError) {
    return (
      <Frame title="Editar episódio">
        <Alert tone="attention">{loadErrorMessage(getApiError(episode.error))}</Alert>
      </Frame>
    );
  }

  // Passou o dia do registro (aqui ou na API, com 409): fica como está.
  const locked = !episode.data.editable || (update.isError && getApiError(update.error).status === 409);
  if (locked) {
    return (
      <Frame title="Editar episódio">
        <Alert tone="attention">
          Este episódio só podia ser alterado no dia em que foi registrado. Ele continua guardado como está.
        </Alert>
        <Link to="/tensao" className={buttonClasses('secondary', 'self-start')}>
          Voltar para os Episódios de tensão
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title="Editar episódio">
      <TensionEpisodeForm
        initial={episode.data}
        initialDate={episode.data.episodeDate}
        submitLabel="Salvar alterações"
        pending={update.isPending}
        apiError={formError(update.error)}
        cancelTo="/tensao"
        onSubmit={(input) =>
          update.mutate({ id, input }, { onSuccess: (saved) => backToWeek(saved, 'Alterações salvas.') })
        }
      />
    </Frame>
  );
}

function loadErrorMessage(error: ApiErrorInfo): string {
  if (error.status === 404 || error.status === 400) return 'Não encontramos este episódio.';
  if (error.status === 403) return 'Você não tem acesso a este episódio.';
  return error.message;
}
