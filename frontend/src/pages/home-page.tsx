import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ThemeSwitcher } from '../components/theme-switcher';
import { useLogout, useSession } from '../features/auth/use-session';

// Tela inicial provisória de quem entrou. As telas reais ("Meus registros" e
// "Meus pacientes") entram nas próximas etapas.
export function HomePage() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();

  // O RequireAuth só renderiza esta tela com sessão, mas o tipo não sabe disso.
  if (!user) return null;

  const firstName = user.name.split(' ')[0];

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-6 py-12">
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

      <section className="flex flex-col gap-3">
        <h1 className="text-4xl font-bold">Olá, {firstName}!</h1>
        <p className="text-lg text-muted">
          Um espaço calmo para registrar suas atividades, no seu ritmo.
        </p>
      </section>

      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Em breve por aqui</h2>
        <p className="text-muted">
          {user.profiles.patient && user.profiles.therapist
            ? 'Seus registros e seus pacientes vão aparecer nesta tela.'
            : user.profiles.therapist
              ? 'Os registros dos seus pacientes vão aparecer nesta tela.'
              : 'Seus registros da semana vão aparecer nesta tela.'}
        </p>
      </Card>
    </main>
  );
}
