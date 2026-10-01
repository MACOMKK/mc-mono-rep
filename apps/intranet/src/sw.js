import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';
import { registerPushHandlers } from '@macom/push/swHandlers';

// Service worker unico deste app: cache offline do app shell (workbox, injectManifest) + Web
// Push -- os dois nao podem ser SWs separados porque disputariam o mesmo escopo '/'. Mesma
// arquitetura de apps/servicos/src/sw.js, mas os handlers de push vem do pacote compartilhado
// (@macom/push/swHandlers) em vez de uma copia local.

// registerType 'autoUpdate' (vite.config.js): o SW novo assume na hora, sem prompt -- diferente
// do servicos, que usa o modo 'prompt' e so pula a espera quando o usuario clica em "Atualizar".
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly());

registerRoute(
  ({ request }) => ['script', 'style', 'image', 'font'].includes(request.destination),
  new CacheFirst({
    cacheName: 'app-shell-assets',
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

registerPushHandlers({ defaultTitle: 'Intranet Macom', icon: '/pwa-icons/pwa-192x192.png' });
