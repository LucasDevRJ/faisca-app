import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';
import { Button } from '../components/ui/button';
import { useLogout, useSession } from '../features/auth/use-session';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 font-medium ${isActive ? 'bg-surface text-primary-text shadow-soft' : 'text-muted hover:text-text'}`;

// Moldura das telas de quem entrou: marca e sair no topo, alternância de perfil e tema no rodapé.
export function AppLayout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const bothProfiles = user?.profiles.patient && user.profiles.therapist;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        {/* A marca leva ao início, que escolhe a tela do perfil: sempre há um caminho de volta. */}
        <Link to="/" aria-label="Faísca, ir para o início" className="flex items-center gap-3 rounded-md">
          <img src="/icon.svg" alt="" className="size-10" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </Link>
        <div className="flex items-center gap-1">
          <NavLink to="/conta" className={navLinkClass}>
            Conta
          </NavLink>
          <Button
            variant="ghost"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/entrar', { replace: true }) })}
          >
            Sair
          </Button>
        </div>
      </header>

      {/* Só quem tem os dois perfis alterna entre eles (SPEC, Contas e perfis). */}
      {bothProfiles && (
        <nav aria-label="Perfis" className="flex gap-2">
          <NavLink to="/registros" className={navLinkClass}>
            Meus registros
          </NavLink>
          <NavLink to="/pacientes" className={navLinkClass}>
            Meus pacientes
          </NavLink>
        </nav>
      )}

      <main className="flex flex-col gap-6 sm:gap-8">
        <Outlet />
      </main>

      {/* O tema fica no rodapé: no celular, o topo tem espaço só para o essencial.
          O espaço embaixo é para o botão flutuante de "Nova atividade" não cobrir nada. */}
      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-6 pb-20 sm:pb-0">
        <span className="text-sm text-muted">Tema</span>
        <ThemeSwitcher />
        <Link to="/privacidade" className="ml-auto text-sm font-medium text-primary-text underline underline-offset-4">
          Privacidade
        </Link>
      </footer>
    </div>
  );
}
