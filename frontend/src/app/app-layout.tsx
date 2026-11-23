import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ThemeSwitcher } from '../components/theme-switcher';
import { Button } from '../components/ui/button';
import { AnnouncementCard } from '../features/announcements/announcement-card';
import { useLogout, useSession } from '../features/auth/use-session';
import { fetchUnread } from '../features/messages/messages-api';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2 py-2 font-medium sm:px-3 ${isActive ? 'bg-surface text-primary-text shadow-soft' : 'text-muted hover:text-text'}`;

// Moldura das telas de quem entrou: marca e sair no topo, alternância de perfil e tema no rodapé.
export function AppLayout() {
  const { data: user } = useSession();
  const logout = useLogout();
  const navigate = useNavigate();
  const bothProfiles = user?.profiles.patient && user.profiles.therapist;
  // Selo de mensagem nova no menu (DEC-127). Só com o aceite das Mensagens; consulta ao trocar de
  // tela e a cada minuto. Não é recibo de leitura: só quem recebe sabe.
  const canMessage = Boolean(user?.privacyAreas.messages);
  const unread = useQuery({
    queryKey: ['messages', user?.id, 'unread'],
    queryFn: ({ signal }) => fetchUnread(signal),
    enabled: canMessage,
    refetchInterval: 60_000,
    retry: false,
  });
  const hasUnread = canMessage && unread.data === true;
  // "Meus registros" segue marcado nas telas de Pensamentos, Tensão, Ação, Consultas e Avisos, que são do
  // mesmo perfil; "Meus pacientes", no Mural.
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const targetId = decodeURIComponent(hash.slice(1));
    let observer: MutationObserver | null = null;
    let timeout: number | undefined;
    const stop = () => {
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
    const reveal = () => {
      const target = document.getElementById(targetId);
      if (!target) return false;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      if (target instanceof HTMLElement && target.tabIndex === -1) target.focus({ preventScroll: true });
      stop();
      return true;
    };
    if (!reveal()) {
      observer = new MutationObserver(reveal);
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(stop, 10_000);
    }
    return stop;
  }, [hash, pathname]);
  // Ao trocar de tela, confere de novo se chegou mensagem.
  const refetchUnread = unread.refetch;
  useEffect(() => {
    if (canMessage) void refetchUnread();
  }, [pathname, canMessage, refetchUnread]);
  const inPatientArea = ['/registros', '/pensamentos', '/tensao', '/acao', '/consultas', '/avisos', '/comunidade'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* A marca leva ao início, que escolhe a tela do perfil: sempre há um caminho de volta. */}
        <Link to="/" aria-label="Faísca, ir para o início" className="flex items-center gap-3 rounded-md">
          <img src="/icon.svg" alt="" className="size-10" />
          <span className="font-heading text-2xl font-bold">Faísca</span>
        </Link>
        {/* Em 320 px, com o selo de mensagem nova, os quatro itens ainda cabem numa linha (revisor-telas). */}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <NavLink to="/mensagens" className={(state) => `inline-flex min-h-11 items-center gap-1.5 ${navLinkClass(state)}`}>
            Mensagens
            {hasUnread && <>
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              <span className="sr-only">, há mensagem nova</span>
            </>}
          </NavLink>
          <NavLink to="/como-funciona" aria-label="Ajuda: Como funciona o Faísca" className={(state) => `inline-flex min-h-11 items-center ${navLinkClass(state)}`}>
            Ajuda
          </NavLink>
          <NavLink to="/conta" className={(state) => `inline-flex min-h-11 items-center ${navLinkClass(state)}`}>
            Conta
          </NavLink>
          <Button
            variant="ghost"
            className="px-2! sm:px-5!"
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
          <NavLink to="/registros" className={({ isActive }) => navLinkClass({ isActive: isActive || inPatientArea })}>
            Meus registros
          </NavLink>
          <NavLink
            to="/pacientes"
            className={({ isActive }) => navLinkClass({ isActive: isActive || pathname === '/mural' })}
          >
            Meus pacientes
          </NavLink>
        </nav>
      )}

      <main className="flex flex-col gap-6 sm:gap-8">
        {/* Novidade do app, uma vez, até o "Entendi" (DEC-055). */}
        <AnnouncementCard />
        <Outlet />
      </main>

      {/* O tema fica no rodapé: no celular, o topo tem espaço só para o essencial.
          O espaço embaixo é para o botão flutuante de "Nova atividade" não cobrir nada. */}
      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-border pt-6 pb-20 sm:pb-0">
        <span className="text-sm text-muted">Tema</span>
        <ThemeSwitcher />
        <Link to="/como-funciona" className="inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline underline-offset-4">
          Como funciona
        </Link>
        <Link to="/privacidade" className="ml-auto text-sm font-medium text-primary-text underline underline-offset-4">
          Privacidade
        </Link>
      </footer>
    </div>
  );
}
