import { NavLink, Outlet, useNavigate } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';
import { Button } from '../components/ui/button';
import { useLogout, useSession } from '../features/auth/use-session';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 font-medium ${isActive ? 'bg-surface text-primary-text shadow-soft' : 'text-muted hover:text-text'}`;

// Moldura das telas de quem entrou: marca, alternância de perfil, tema e sair.
export function AppLayout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const bothProfiles = user?.profiles.patient && user.profiles.therapist;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-10" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeSwitcher />
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

      <main className="flex flex-col gap-8">
        <Outlet />
      </main>
    </div>
  );
}
