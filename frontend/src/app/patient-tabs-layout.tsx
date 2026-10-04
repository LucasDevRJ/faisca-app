import { NavLink, Outlet, useLocation } from 'react-router';
import { PrivacyUpdateBanner, type PrivacyArea } from '../features/auth/privacy-consent';

// Três abas num celular de 360px: texto menor e menos espaço interno; no computador, como antes.
const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-sm font-medium sm:flex-none sm:px-4 sm:text-base ${
    isActive ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-text hover:bg-bg'
  }`;

// Área de cada aba com pedido de aceite próprio (DEC-039, DEC-042).
const GATED: Record<string, PrivacyArea> = {
  '/pensamentos': 'thoughtRecords',
  '/tensao': 'tensionEpisodes',
};

// Telas principais do paciente: Atividades, Pensamentos e Tensão, em abas (DEC-040, DEC-043).
// A faixa do aviso de privacidade aparece aqui enquanto falta algum aceite.
export function PatientTabsLayout() {
  const location = useLocation();
  const gatedArea = GATED[location.pathname];
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
      <nav aria-label="Registros" className="flex gap-2">
        <NavLink to={{ pathname: '/registros', search }} className={tabClass}>
          Atividades
        </NavLink>
        <NavLink to={{ pathname: '/pensamentos', search }} end className={tabClass}>
          Pensamentos
        </NavLink>
        <NavLink to={{ pathname: '/tensao', search }} end className={tabClass}>
          Tensão
        </NavLink>
      </nav>
      <PrivacyUpdateBanner gatedArea={gatedArea} />
      <Outlet />
    </>
  );
}
