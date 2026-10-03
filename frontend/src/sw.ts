/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

// Versão nova do app espera a pessoa tocar em "Atualizar" (registerType: 'prompt', DEC-041).
// Assumir sozinha trocaria o código por baixo de uma tela aberta, que só mudaria ao recarregar.
// A mensagem vem do updateServiceWorker() do virtual:pwa-register (src/app/update-prompt.tsx).
self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
// Na primeira instalação não há versão antiga: o service worker já assume a tela aberta.
clientsClaim();

// Precache só do shell do app (JS, CSS, HTML, fontes, ícones), gerado no build.
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Navegação da SPA abre o index.html do cache. /api fica de fora.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
);

// Regra do frontend/CLAUDE.md: nenhuma rota de cache em runtime.
// Respostas da API nunca são guardadas pelo service worker.
// O Web Push (evento 'push') entra aqui na etapa de lembretes.
