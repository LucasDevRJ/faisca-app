import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { PrivacyUpdateBanner, type PrivacyArea } from '../features/auth/privacy-consent';
import { useSession } from '../features/auth/use-session';
import { usePlans } from '../features/plans/use-plans';
import { useAccessibility } from '../features/profile/use-profile';

// No celular, as abas ficam em grade: 2×2 com quatro (DEC-052) e 3 colunas com cinco ou seis
// (DEC-095); no computador, uma linha só. Texto menor no celular.
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center justify-center rounded-md px-2 text-center text-sm font-medium sm:px-4 sm:text-base ${
    isActive ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-text hover:bg-bg'
  }`;

const linkClass = 'font-medium text-primary-text underline underline-offset-4';

// Área de cada aba com pedido de aceite próprio (DEC-039, DEC-042).
const GATED: Record<string, PrivacyArea> = {
  '/pensamentos': 'thoughtRecords',
  '/tensao': 'tensionEpisodes',
  '/acao': 'actions',
};

function gatedAreaOf(pathname: string): PrivacyArea | undefined {
  if (pathname === '/planos' || pathname.startsWith('/planos/')) return 'plans';
  return GATED[pathname];
}

// Telas principais do paciente: Atividades, Pensamentos, Tensão, Ação e Meus Planos, em abas
// (DEC-040, DEC-043, DEC-052, DEC-095). A faixa do aviso de privacidade aparece aqui enquanto falta
// algum aceite.
export function PatientTabsLayout() {
  const location = useLocation();
  const { data: user } = useSession();
  const { directLanguage } = useAccessibility();
  const gatedArea = gatedAreaOf(location.pathname);
  const plansConsented = Boolean(user?.privacyAreas.plans);
  const plans = usePlans(plansConsented);
  const inPlans = gatedArea === 'plans';
  // A aba Meus Planos só aparece quando existe algum plano (escolha do usuário, DEC-095), ou
  // enquanto a pessoa está nela. Sem plano, um link discreto leva a criar o primeiro.
  const showPlans = inPlans || (plans.data?.length ?? 0) > 0;
  const showCreateLink = !showPlans && (!plansConsented || plans.isSuccess);
  // Trocar de aba mantém o período aberto (ciclo ou semana, DEC-050).
  const params = new URLSearchParams(location.search);
  const kept = new URLSearchParams();
  for (const key of ['ciclo', 'semana']) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const search = kept.size ? `?${kept}` : '';
  return (
    <>
      <nav aria-label="Registros" className={`grid ${showPlans ? 'grid-cols-3' : 'grid-cols-2'} gap-2 sm:flex`}>
        <NavLink to={{ pathname: '/registros', search }} className={tabClass}>
          Atividades
        </NavLink>
        <NavLink to={{ pathname: '/pensamentos', search }} end className={tabClass}>
          Pensamentos
        </NavLink>
        <NavLink to={{ pathname: '/tensao', search }} end className={tabClass}>
          Tensão
        </NavLink>
        <NavLink to={{ pathname: '/acao', search }} end className={tabClass}>
          Ação
        </NavLink>
        {showPlans && (
          // Sem `end`: a aba continua marcada nos registros de um plano (/planos/:id).
          <NavLink to="/planos" className={tabClass}>
            Meus Planos
          </NavLink>
        )}
      </nav>
      {showCreateLink && (
        <p className="text-sm text-muted">
          {directLanguage ? (
            <Link to="/planos/novo" className={linkClass}>
              Criar um plano de ação
            </Link>
          ) : (
            <>
              Combinou um plano de ação com sua psicóloga?{' '}
              <Link to="/planos/novo" className={linkClass}>
                Criar um plano
              </Link>
            </>
          )}
        </p>
      )}
      <PrivacyUpdateBanner gatedArea={gatedArea} />
      <Outlet />
    </>
  );
}
