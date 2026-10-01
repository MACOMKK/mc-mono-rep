// Handlers de Web Push pra rodar DENTRO do service worker de um app PWA (estrategia
// `injectManifest` do vite-plugin-pwa) -- o app importa e chama `registerPushHandlers()` no
// proprio `src/sw.js` em vez de copiar este codigo. Exemplo: apps/intranet/src/sw.js.
// Mesmo comportamento de packages/push/push-sw.js, que continua existindo como arquivo classico
// (sem import) pra apps sem PWA, copiado pra `public/`. Se o formato do payload mudar, atualizar
// aqui E la (e em apps/servicos/src/sw.js enquanto ele ainda tiver a copia propria).

export function registerPushHandlers({ defaultTitle = 'MACOM', icon = '/favicon.svg', badge = '/favicon.svg' } = {}) {
  self.addEventListener('push', (event) => {
    let data = {};
    try {
      data = event.data ? event.data.json() : {};
    } catch {
      data = { title: 'Notificacao', body: event.data ? event.data.text() : '' };
    }

    const title = data.title || defaultTitle;
    const options = {
      body: data.body || '',
      icon,
      badge,
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
}
