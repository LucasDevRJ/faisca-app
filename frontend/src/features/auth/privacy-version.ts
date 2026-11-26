// A versão do aviso de privacidade que este app mostra em /privacidade (DEC-105). Vai junto em cada
// aceite e no cadastro: o servidor só grava a versão que a pessoa leu. Muda junto com o texto de
// pages/privacy-page.tsx e com o PRIVACY_VERSION do backend (src/modules/auth/privacy.ts).
export const SHOWN_PRIVACY_VERSION = import.meta.env.VITE_ACTIVITY_VIDEOS_ENABLED === 'true'
  ? '2026-11.15'
  : import.meta.env.VITE_ACTION_VIDEOS_ENABLED === 'true' ? '2026-11.14' : '2026-11.13';
