import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Service worker unico deste app: alem do cache offline do app shell (workbox, injectManifest),
// tambem trata Web Push -- os dois nao podem ser SWs separados porque ambos disputariam o mesmo
// escopo '/' (o registro de service worker e chaveado por escopo, o segundo substituiria o
// primeiro). Ver apps/servicos/CLAUDE.md, secao "Shell mobile" nao cobre isso -- registrado ali
// como decisao de arquitetura no commit que introduziu PWA neste app. A logica de push abaixo e
// copia de packages/push/push-sw.js (fonte generica pros apps sem PWA); se o formato do payload
// mudar, atualizar aqui E la.

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(({ url }) => url.hostname.endsWith('.supabase.co'), new NetworkOnly());

// Imagens (diagrama de veiculo, logos) ficam fora do precache do install (ver vite.config.js,
// injectManifest.globPatterns) de proposito -- o app nao precisa funcionar offline desde a
// primeira visita, e precachear tudo no login competia por banda com as chamadas de API reais.
// Em vez disso, cacheiam sob demanda na primeira vez que a tela que usa a imagem e aberta.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'servicos-images',
    plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
);

registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// So pula a fase de espera quando o cliente pedir explicitamente (clique em "Atualizar" no
// toast de AppUpdatePrompt.jsx, via updateServiceWorker(true)) -- um skipWaiting() incondicional
// aqui faz o SW novo ativar sozinho sem nunca passar pelo estado "waiting", o que impede o
// workbox-window de disparar o evento que aciona esse toast.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Notificacao', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'MACOM';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || '/' },
    // Fica fixa na tela ate o usuario interagir -- por padrao o SO some com o toast em
    // poucos segundos, e o usuario pode nao estar olhando na hora.
    requireInteraction: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});
