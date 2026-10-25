import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { DialogFooter } from '../../components/ui/dialog';
import { getApiError, type SessionUser } from './auth-api';
import { useAcceptPrivacy, useSession } from './use-session';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export type PrivacyArea = keyof SessionUser['privacyAreas'];
type Audience = 'patient' | 'therapist';

const AREA_NAME: Record<PrivacyArea, string> = {
  thoughtRecords: 'o Registro de Pensamentos',
  tensionEpisodes: 'os Episódios de tensão',
  appointmentSchedule: 'a agenda de consultas',
  actions: 'a Ação',
  actionPhotos: 'as fotos da Ação',
};

// O mesmo aceite (DEC-039, DEC-042), com o texto de quem o faz e da área bloqueada: o paciente
// consente com o uso dos próprios dados; a terapeuta, com o acesso aos dos pacientes (DEC-041).
const CONSENT_TEXT: Record<PrivacyArea, Record<Audience, { intro: string; scope: string }>> = {
  thoughtRecords: {
    patient: {
      intro: 'Para usar esta parte, leia o que mudou e confirme.',
      scope: 'inclusive com o uso dos meus pensamentos e emoções como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver o Registro de Pensamentos dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso aos pensamentos e emoções dos meus pacientes como dados de saúde.',
    },
  },
  tensionEpisodes: {
    patient: {
      intro: 'Para usar esta parte, leia o que mudou e confirme.',
      scope: 'inclusive com o uso dos meus episódios de tensão como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver os Episódios de tensão dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso aos episódios de tensão dos meus pacientes como dados de saúde.',
    },
  },
  // Agenda (DEC-045): hora das sessões, motivos de desmarcar e remarcar e pausas.
  appointmentSchedule: {
    patient: {
      intro: 'Para montar sua agenda, leia o que mudou e confirme.',
      scope: 'inclusive com o uso da hora das sessões, dos motivos de desmarcar ou remarcar e das pausas.',
    },
    therapist: {
      intro: 'Para ver a agenda dos seus pacientes, com os motivos, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso à agenda dos meus pacientes, com os motivos de desmarcar ou remarcar e as pausas.',
    },
  },
  // Ação (DEC-051): as ações, as notas de expectativa, prazer e realização e as observações.
  actions: {
    patient: {
      intro: 'Para usar esta parte, leia o que mudou e confirme.',
      scope: 'inclusive com o uso das minhas ações e das notas de expectativa, prazer e realização como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver a Ação dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso às ações e às notas dos meus pacientes como dados de saúde.',
    },
  },
  // Fotos da Ação (DEC-064): as fotos que o paciente adiciona a uma ação avaliada.
  actionPhotos: {
    patient: {
      intro: 'Para adicionar fotos às suas ações, leia o que mudou e confirme.',
      scope: 'inclusive com o uso das fotos que eu adicionar às minhas ações como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver as fotos das ações dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso às fotos das ações dos meus pacientes como dados de saúde.',
    },
  },
};

// onCancel: o pedido está numa janela (Dialog), que já tem o título; sem o cartão e com "Agora não".
// onAccepted: depois do aceite salvo, para quem abriu a janela fechá-la.
type PrivacyConsentGateProps = {
  area: PrivacyArea;
  audience?: Audience;
  onCancel?: () => void;
  onAccepted?: () => void;
};

// Novo aceite do aviso de privacidade, no lugar da área bloqueada. Mesmo consentimento do
// cadastro: caixa desmarcada e explícita (DEC-036). Um aceite libera todas as áreas (DEC-042).
export function PrivacyConsentGate({ area, audience = 'patient', onCancel, onAccepted }: PrivacyConsentGateProps) {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = useAcceptPrivacy();
  const text = CONSENT_TEXT[area][audience];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      setError('Para continuar, marque que você leu e concorda com o aviso.');
      return;
    }
    setError(null);
    accept.mutate(undefined, { onSuccess: () => onAccepted?.(), onError: (e) => setError(getApiError(e).message) });
  }

  const submit = (
    <Button type="submit" disabled={accept.isPending}>
      {accept.isPending ? 'Salvando…' : 'Aceitar e continuar'}
    </Button>
  );

  const body = (
    <>
      <p>
        Atualizamos o aviso de privacidade para incluir {AREA_NAME[area]}. {text.intro} O resto do Faísca
        continua igual.
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {error && <Alert tone="attention">{error}</Alert>}
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Li e concordo com o{' '}
            {/* Outra aba: a pessoa lê o aviso sem sair daqui. */}
            <Link to="/privacidade" target="_blank" rel="noopener" className={linkClass}>
              aviso de privacidade
            </Link>
            , {text.scope}
          </span>
        </label>
        {onCancel ? (
          <DialogFooter>
            <Button variant="secondary" onClick={onCancel}>
              Agora não
            </Button>
            {submit}
          </DialogFooter>
        ) : (
          <div>{submit}</div>
        )}
      </form>
    </>
  );

  if (onCancel) return <div className="flex flex-col gap-4">{body}</div>;

  return (
    <section
      aria-labelledby="privacy-consent-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-soft sm:p-6"
    >
      <h2 id="privacy-consent-title" className="text-xl font-semibold">
        Antes de começar
      </h2>
      {body}
    </section>
  );
}

// "o Registro de Pensamentos e os Episódios de tensão"
function joinAreas(areas: PrivacyArea[]): string {
  const names = areas.map((area) => AREA_NAME[area]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : (names[0] ?? '');
}

// Faixa discreta para quem ainda não aceitou: avisa no app que o aviso mudou e cita só o que
// falta liberar (DEC-043). Não bloqueia nada; o aceite fica em cada área.
// gatedArea: a área cujo pedido de aceite já está na tela. Se ela ainda está bloqueada, o próprio
// pedido explica a mudança, e a faixa sai para não repetir.
export function PrivacyUpdateBanner({ gatedArea }: { gatedArea?: PrivacyArea }) {
  const { data: user } = useSession();
  if (!user || user.privacyUpToDate) return null;
  if (gatedArea && !user.privacyAreas[gatedArea]) return null;

  const missing = (Object.keys(AREA_NAME) as PrivacyArea[]).filter((area) => !user.privacyAreas[area]);
  if (missing.length === 0) return null;

  return (
    <Alert>
      Atualizamos o aviso de privacidade para incluir {joinAreas(missing)}. Você só precisa aceitar a nova versão
      para usar {missing.length > 1 ? 'essas partes' : 'essa parte'}.{' '}
      <Link to="/privacidade" className={linkClass}>
        Ver o que mudou
      </Link>
    </Alert>
  );
}
