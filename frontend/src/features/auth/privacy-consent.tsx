import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Alert } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';
import { DialogFooter } from '../../components/ui/dialog';
import { getApiError, type SessionUser } from './auth-api';
import { useAcceptPrivacy, useSession } from './use-session';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

export type PrivacyArea = keyof SessionUser['privacyAreas'];
type Audience = 'patient' | 'therapist' | 'moderator';

const AREA_NAME: Record<PrivacyArea, string> = {
  thoughtRecords: 'o Registro de Pensamentos',
  tensionEpisodes: 'os Episódios de tensão',
  appointmentSchedule: 'a agenda de consultas',
  actions: 'a Ação',
  actionPhotos: 'as fotos da Ação',
  aboutMe: 'o “Sobre mim”',
  plans: 'o Meus Planos',
  activityPhotos: 'as fotos das atividades',
  tasks: 'as Tarefas',
  sleepMood: 'o Sono e humor',
  medication: 'o Remédio do dia',
  community: 'a Comunidade',
  medications: 'os Remédios e o que sinto',
  readReceipts: 'a opção de ver quando a profissional lê os registros',
};

// O mesmo aceite (DEC-039, DEC-042), com o texto de quem o faz e da área bloqueada: o paciente
// consente com o uso dos próprios dados; a terapeuta, com o acesso aos dos pacientes (DEC-041).
type ConsentCopy = { intro: string; scope: string };
const CONSENT_TEXT: Record<PrivacyArea, { patient: ConsentCopy; therapist: ConsentCopy; moderator?: ConsentCopy }> = {
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
  // Fotos das atividades (DEC-103, DEC-104): as fotos que o paciente adiciona a uma atividade.
  activityPhotos: {
    patient: {
      intro: 'Para adicionar fotos às suas atividades, leia o que mudou e confirme.',
      scope: 'inclusive com o uso das fotos que eu adicionar às minhas atividades como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver as fotos das atividades dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso às fotos das atividades dos meus pacientes como dados de saúde.',
    },
  },
  tasks: {
    patient: {
      intro: 'Para usar as Tarefas, leia o que mudou e confirme.',
      scope: 'inclusive com o uso das minhas tarefas e respostas como dados de saúde.',
    },
    therapist: {
      intro: 'Para ler as Tarefas dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso às tarefas e respostas dos meus pacientes como dados de saúde.',
    },
  },
  // "Sobre mim" (DEC-081, DEC-082): o que o paciente conta sobre si.
  aboutMe: {
    patient: {
      intro: 'Para contar sobre você no “Sobre mim”, leia o que mudou e confirme.',
      scope: 'inclusive com o uso do que eu escrever no “Sobre mim” como dado de saúde.',
    },
    therapist: {
      intro: 'Para ler o “Sobre mim” dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso ao “Sobre mim” dos meus pacientes como dado de saúde.',
    },
  },
  // Meus Planos (DEC-094, DEC-095): os planos de ação e o que o paciente registra em cada um.
  plans: {
    patient: {
      intro: 'Para usar o Meus Planos, leia o que mudou e confirme.',
      scope: 'inclusive com o uso dos meus planos e do que eu registrar neles como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver o Meus Planos dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso aos planos dos meus pacientes e ao que eles registrarem neles como dados de saúde.',
    },
  },
  // Sono e humor (DEC-107, DEC-108): horários de deitar e acordar, notas do sono e do humor e a palavra do dia.
  sleepMood: {
    patient: {
      intro: 'Para registrar o sono e o humor, leia o que mudou e confirme.',
      scope: 'inclusive com o uso do meu sono, do meu humor e, se eu ligar, de se tomei o remédio como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver o sono e o humor dos seus pacientes, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso ao sono, ao humor e ao remédio do dia dos meus pacientes como dados de saúde.',
    },
  },
  // Remédio do dia (DEC-107): só se tomou como combinado, sem nome nem dose.
  medication: {
    patient: {
      intro: 'Para registrar se tomou o remédio, leia o que mudou e confirme.',
      scope: 'inclusive com o uso de se tomei o remédio como combinado como dado de saúde.',
    },
    therapist: {
      intro: 'Para ver se seus pacientes tomaram o remédio como combinado, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso a se meus pacientes tomaram o remédio como combinado como dado de saúde.',
    },
  },
  // Remédios e o que sinto (DEC-114, DEC-115): nome, dose e horário, as mudanças e o que a pessoa sente.
  medications: {
    patient: {
      intro: 'Para anotar seus remédios e o que tem sentido, leia o que mudou e confirme.',
      scope: 'inclusive com o uso dos meus remédios, das mudanças e do que eu anotar que sinto como dados de saúde.',
    },
    therapist: {
      intro: 'Para ver os remédios e o que seus pacientes têm sentido, leia o que mudou e confirme.',
      scope: 'inclusive com o acesso aos remédios, às mudanças e ao que meus pacientes anotarem que sentem como dados de saúde.',
    },
  },
  // "Lido" para o paciente (DEC-117, DEC-118): a data em que a profissional leu, se os dois ligarem.
  readReceipts: {
    patient: {
      intro: 'Para pedir para ver quando a profissional lê os seus registros, leia o que mudou e confirme.',
      scope: 'inclusive com o uso do meu pedido e das datas em que cada profissional que ativar leu os meus registros.',
    },
    therapist: {
      intro: 'Para responder aos pedidos dos pacientes que querem ver quando você lê os registros, leia o que mudou e confirme.',
      scope: 'inclusive com mostrar aos pacientes, quando eu ativar, as datas em que marquei os registros como lidos.',
    },
  },
  community: {
    patient: {
      intro: 'Para participar da Comunidade, leia como seu apelido e conteúdo serão usados e quem poderá vê-los.',
      scope: 'inclusive com o uso do meu apelido, das minhas publicações, comentários e denúncias na Comunidade, visíveis aos membros e à psicóloga responsável e revisados por uma pessoa moderadora.',
    },
    therapist: {
      intro: 'Para criar e acompanhar a Comunidade, leia como o conteúdo dos participantes será usado.',
      scope: 'inclusive com o acesso e a moderação das publicações e comentários feitos na Comunidade, sem acesso aos registros clínicos por esta área.',
    },
    moderator: {
      intro: 'Para revisar conteúdo da Comunidade, leia o que poderá acessar e como será usado.',
      scope: 'inclusive com o acesso às publicações, comentários e denúncias da Comunidade para revisão humana, sem acesso aos registros clínicos.',
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
  const text = CONSENT_TEXT[area][audience] ?? CONSENT_TEXT[area].patient;

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
        {error && (
          <div id="privacy-consent-error">
            <Alert tone="attention">{error}</Alert>
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'privacy-consent-error' : undefined}
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

  // O que falta liberar vem da API, e não da lista deste app (achado do revisor-seguranca, DEC-105):
  // um app desatualizado não conhece a área nova e mostraria o aceite de uma versão sem área nova,
  // com um texto que não é o da versão atual.
  const missing = Object.entries(user.privacyAreas)
    .filter(([, allowed]) => !allowed)
    .map(([area]) => area);
  if (missing.some((area) => !(area in AREA_NAME))) {
    return (
      <Alert>
        Atualizamos o aviso de privacidade. Atualize o app para ver o que mudou.{' '}
        <Link to="/privacidade" className={linkClass}>
          Ver o aviso
        </Link>
      </Alert>
    );
  }
  // Versão nova sem área nova (2026-10.7, DEC-078): nada a liberar, então o aceite fica na faixa.
  if (missing.length === 0) return <PrivacyVersionConsent />;

  return (
    <Alert>
      Atualizamos o aviso de privacidade para incluir {joinAreas(missing as PrivacyArea[])}. Você só precisa aceitar a nova versão
      para usar {missing.length > 1 ? 'essas partes' : 'essa parte'}.{' '}
      <Link to="/privacidade" className={linkClass}>
        Ver o que mudou
      </Link>
    </Alert>
  );
}

// Aceite de uma versão do aviso que não traz área nova (DEC-078): as cópias de segurança mudam onde
// e por quanto tempo os dados ficam, mas não liberam nem bloqueiam nada. Mesmo consentimento do
// cadastro: caixa desmarcada e explícita (DEC-036). A faixa some depois do aceite.
function PrivacyVersionConsent() {
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = useAcceptPrivacy();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checked) {
      setError('Para aceitar, marque que você leu e concorda com o aviso.');
      return;
    }
    setError(null);
    accept.mutate(undefined, { onError: (e) => setError(getApiError(e).message) });
  }

  return (
    <section
      aria-labelledby="privacy-version-title"
      className="flex flex-col gap-3 rounded-md border-l-4 border-primary bg-bg px-4 py-3 text-text"
    >
      {/* Parágrafo, e não título: a faixa fica acima do <h1> da tela e não pode quebrar a ordem dos títulos. */}
      <p id="privacy-version-title" className="font-semibold">
        O aviso de privacidade mudou
      </p>
      <p>
        Agora você pode compartilhar com até duas profissionais (uma psicóloga e uma psiquiatra) e escolher o
        que cada uma vê. Quem já acompanha você continua vendo o que via, e uma profissional nova começa sem ver
        nada.{' '}
        {/* Outra aba: a pessoa lê o aviso sem perder a caixa marcada. */}
        <Link to="/privacidade" target="_blank" rel="noopener" className={linkClass}>
          Ver o que mudou
        </Link>
      </p>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        {error && (
          <div id="privacy-version-error">
            <Alert tone="attention">{error}</Alert>
          </div>
        )}
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'privacy-version-error' : undefined}
            className="mt-0.5"
          />
          <span>Li e concordo com o aviso de privacidade.</span>
        </label>
        <div>
          <Button type="submit" disabled={accept.isPending}>
            {accept.isPending ? 'Salvando…' : 'Aceitar'}
          </Button>
        </div>
      </form>
    </section>
  );
}
