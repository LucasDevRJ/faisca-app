import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { buttonClasses } from '../components/ui/button-styles';
import { getApiError } from '../features/auth/auth-api';
import { AuthLayout } from '../features/auth/auth-layout';
import { useSession } from '../features/auth/use-session';
import { inviteState, readInviteToken } from '../features/links/invite-state';
import { useAcceptInvite } from '../features/links/use-links';
import { KindChoice } from '../features/links/kind-choice';
import type { ProfessionalKind } from '../features/links/links-api';

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// Aberta pelo link do convite (SPEC, "Convite por e-mail"). Com sessão, aceita com um toque.
// Sem sessão, leva a entrar ou criar conta e volta para cá com o token no state.
const KIND_WORD: Record<ProfessionalKind, string> = { PSICOLOGIA: 'psicóloga', PSIQUIATRIA: 'psiquiatra' };

export function InvitePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user, isPending } = useSession();
  const accept = useAcceptInvite();
  // Sem nada marcado: escolher errado ocuparia a vaga da outra profissional (DEC-099).
  const [kind, setKind] = useState<ProfessionalKind | null>(null);
  const [kindError, setKindError] = useState<string>();
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? readInviteToken(location.state));

  // Tira o token da barra de endereço (histórico, favoritos, capturas de tela) e o guarda no state.
  useEffect(() => {
    if (token && new URLSearchParams(location.search).has('token')) {
      navigate(location.pathname, { replace: true, state: inviteState(token) });
    }
  }, [token, location, navigate]);

  if (!token) {
    return (
      <AuthLayout title="Link incompleto">
        <p>Este endereço não tem o código do convite. Abra o link direto do e-mail do Faísca.</p>
        <Link to="/" className={linkClass}>
          Ir para o início
        </Link>
      </AuthLayout>
    );
  }

  if (isPending) {
    return (
      <AuthLayout title="Convite">
        <p className="text-muted">Carregando…</p>
      </AuthLayout>
    );
  }

  if (accept.isSuccess) {
    return (
      <AuthLayout title="Vínculo feito" description={`Agora você acompanha os registros de ${accept.data.name}.`}>
        <p className="text-muted">O paciente recebeu um aviso com o seu nome e e-mail.</p>
        <Link to="/pacientes" className={buttonClasses()}>
          Ver meus pacientes
        </Link>
      </AuthLayout>
    );
  }

  const description = 'Um paciente quer compartilhar com você os registros de atividades feitos no Faísca.';

  if (!user) {
    return (
      <AuthLayout title="Você recebeu um convite" description={description}>
        <p>Entre na sua conta ou crie uma para aceitar. O acesso é só de leitura, sem alterar nada.</p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => navigate('/entrar?next=/convite', { state: inviteState(token) })}>Entrar</Button>
          <Button variant="secondary" onClick={() => navigate('/cadastro', { state: inviteState(token) })}>
            Criar conta
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Você recebeu um convite" description={description}>
      <p className="text-sm text-muted">
        Você está como {user.name} (<span className="break-all">{user.email}</span>).
        {!user.profiles.therapist && ' Ao aceitar, o perfil de terapeuta é ativado na sua conta.'}
      </p>
      {/* Quem ainda não é profissional escolhe o tipo: o paciente pode ter uma de cada (DEC-097). */}
      {!user.profiles.therapist && (
        <KindChoice
          name="invite-kind"
          value={kind}
          onChange={(value) => {
            setKind(value);
            setKindError(undefined);
          }}
          error={kindError}
        />
      )}
      {accept.isError && <Alert tone="attention">{getApiError(accept.error).message}</Alert>}
      <Button
        disabled={accept.isPending}
        onClick={() => {
          if (user.profiles.therapist) {
            accept.mutate({ token });
            return;
          }
          if (!kind) {
            setKindError('Escolha a sua profissão para aceitar.');
            return;
          }
          accept.mutate({ token, professionalKind: kind });
        }}
      >
        {accept.isPending
          ? 'Aceitando…'
          : !user.profiles.therapist && kind
            ? `Aceitar como ${KIND_WORD[kind]}`
            : 'Aceitar convite'}
      </Button>
      <Link to="/" className={linkClass}>
        Agora não
      </Link>
    </AuthLayout>
  );
}
