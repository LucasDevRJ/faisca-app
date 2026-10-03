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
  const gatedArea = GATED[useLocation().pathname];
  return (
    <>
      <nav aria-label="Registros" className="flex gap-2">
        <NavLink to="/registros" className={tabClass}>
          Atividades
        </NavLink>
        <NavLink to="/pensamentos" end className={tabClass}>
          Pensamentos
        </NavLink>
        <NavLink to="/tensao" end className={tabClass}>
          Tensão
        </NavLink>
      </nav>
      <PrivacyUpdateBanner gatedArea={gatedArea} />
      <Outlet />
    </>
  );
}
