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

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
};

// Só caminhos internos do app (começando com /, sem // nem /\).
function safePushUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) {
    return '/registros';
  }
  return url;
}

// Lembretes por Web Push (DEC-089, DEC-090). O texto já vem neutro da API (regra 3).
self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = (event.data.json() as PushPayload) ?? {};
    } catch {
      payload = {};
    }
  }
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Faísca';
  const body =
    typeof payload.body === 'string' && payload.body.trim()
      ? payload.body
      : 'Você tem atividades para ver no Faísca.';
  const url = safePushUrl(payload.url);
  const tag = typeof payload.tag === 'string' && payload.tag.trim() ? payload.tag : 'faisca-reminder';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      tag,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = safePushUrl((event.notification.data as { url?: unknown } | null)?.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            await client.navigate(targetUrl).catch(() => undefined);
          }
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    }),
  );
});
