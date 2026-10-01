import { NavLink, Outlet, useLocation } from 'react-router';
import { PrivacyUpdateBanner } from '../features/thought-records/privacy-consent';

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 flex-1 items-center justify-center rounded-md px-4 font-medium sm:flex-none ${
    isActive ? 'bg-primary text-on-primary' : 'border border-border bg-surface text-text hover:bg-bg'
  }`;

// Telas principais do paciente: Atividades e Pensamentos, em abas (DEC-040). A faixa do aviso
// de privacidade aparece aqui enquanto o novo aceite não for feito (DEC-039).
export function PatientTabsLayout() {
  // Em /pensamentos, o próprio pedido de aceite já explica a mudança.
  const onThoughts = useLocation().pathname === '/pensamentos';
  return (
    <>
      <nav aria-label="Registros" className="flex gap-2">
        <NavLink to="/registros" className={tabClass}>
          Atividades
        </NavLink>
        <NavLink to="/pensamentos" end className={tabClass}>
          Pensamentos
        </NavLink>
      </nav>
      {!onThoughts && <PrivacyUpdateBanner />}
      <Outlet />
    </>
  );
}
