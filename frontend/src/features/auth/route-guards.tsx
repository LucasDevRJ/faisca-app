import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { inviteState, readInviteToken } from '../links/invite-state';
import { safeNextPath, useSession } from './use-session';

// A interface não é barreira de segurança (frontend/CLAUDE.md): estes guardas só evitam
// mostrar tela vazia. Quem protege os dados é o 401/403 do backend.

function SessionLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center" aria-busy="true">
      <p className="text-muted">Carregando…</p>
    </main>
  );
}

function SessionError() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-bold">Não conseguimos abrir o Faísca agora</h1>
      <p className="text-muted">Confira sua conexão e recarregue a página em instantes.</p>
    </main>
  );
}

// Só para quem entrou. Quem não entrou vai para /entrar e volta para cá depois do login.
export function RequireAuth() {
  const { data: user, isPending, isError } = useSession();
  const location = useLocation();

  if (isPending) return <SessionLoading />;
  if (isError) return <SessionError />;
  if (!user) {
    const next = location.pathname + location.search;
    const target = next === '/' ? '/entrar' : `/entrar?next=${encodeURIComponent(next)}`;
    return <Navigate to={target} replace />;
  }
  return <Outlet />;
}

// Entrar, cadastro e "esqueci a senha": quem já entrou não precisa ver essas telas.
export function GuestOnly() {
  const { data: user, isPending, isError } = useSession();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  if (isPending) return <SessionLoading />;
  // Sem conseguir checar a sessão, mostra a tela: o formulário mostra o erro se a API seguir fora.
  // Logo depois do login este redirecionamento acontece antes do da tela, então também leva
  // o token do convite, se houver (DEC-032).
  if (!isError && user) {
    const state = inviteState(readInviteToken(location.state));
    return <Navigate to={safeNextPath(searchParams.get('next'))} replace state={state} />;
  }
  return <Outlet />;
}

// "Quem tem um perfil só nunca vê telas do outro" (SPEC): sem o perfil, volta para o início,
// que escolhe a tela certa. Os dados continuam protegidos pelo 403 do backend.
export function RequireProfile({ profile }: { profile: 'patient' | 'therapist' }) {
  const { data: user } = useSession();
  if (!user?.profiles[profile]) return <Navigate to="/" replace />;
  return <Outlet />;
}

// A tela inicial depende do perfil: paciente vai para os registros; só terapeuta, para os pacientes.
export function HomeRedirect() {
  const { data: user } = useSession();
  return <Navigate to={user?.profiles.patient ? '/registros' : '/pacientes'} replace />;
}
