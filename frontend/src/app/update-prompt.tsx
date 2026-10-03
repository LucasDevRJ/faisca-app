import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdateBanner } from '../components/update-banner';

// De quanto em quanto tempo o app aberto pergunta se há versão nova.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// Registra o service worker e oferece a versão nova quando ela estiver instalada (DEC-041).
// Fica fora do router, no main.tsx: aparece em qualquer tela, logado ou não.
export function UpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onRegisteredSW: (_url, reg) => setRegistration(reg) });

  // O navegador só procura versão nova ao abrir o app. O PWA instalado fica dias em segundo
  // plano sem isso: pergunta de hora em hora e sempre que o app volta para a frente.
  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const interval = window.setInterval(check, UPDATE_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [registration]);

  if (!needRefresh) return null;

  return (
    <UpdateBanner
      updating={updating}
      onUpdate={() => {
        setUpdating(true);
        // Manda a versão nova assumir; a página recarrega quando ela tomar o controle.
        void updateServiceWorker(true);
      }}
      // "Agora não": a versão nova assume sozinha quando todas as abas do app forem fechadas.
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
