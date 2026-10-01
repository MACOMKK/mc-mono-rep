// Envio de Web Push (Service Worker + Push API), compartilhado entre todas as Edge Functions
// `*-api` do monorepo -- qualquer app novo que precise avisar o usuario com o app fechado so
// precisa chamar `sendPushToColaborador` depois de gravar a notificacao in-app (mesmo padrao ja
// usado em `servicos-api` -> `insertNotificacao`). Nao depende de nenhuma tabela/schema
// especifica de app: le de `public.push_subscriptions`, que e compartilhada.
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:suporte@macom.com.br';

// Janela de tolerancia do heartbeat (usePushNotifications manda um a cada 20s enquanto a aba
// esta visivel) -- se o ultimo heartbeat desse dispositivo foi mais recente que isso, o app esta
// aberto na tela agora, e o push so duplicaria o toast in-app que ja chega via Realtime.
const HEARTBEAT_ATIVO_MS = 35 * 1000;

let vapidConfigured = false;
function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string | null;
  url?: string | null;
};

// deno-lint-ignore no-explicit-any
export async function sendPushToColaborador(sql: any, sistema: string, colaboradorId: string, payload: PushPayload) {
  if (!ensureVapidConfigured()) return;
  if (!colaboradorId) return;

  const subs = await sql.unsafe(
    `select id, endpoint, p256dh, auth, last_seen_em from public.push_subscriptions where colaborador_id = $1 and sistema = $2;`,
    [colaboradorId, sistema],
  );
  await sendToSubscriptions(sql, subs, payload);
}

// Variante em lote de `sendPushToColaborador` -- pra notificacoes de audiencia ampla (ex.: aviso
// novo da intranet pra todos os colaboradores ativos), busca as inscricoes de todos numa query so
// em vez de uma por colaborador.
// deno-lint-ignore no-explicit-any
export async function sendPushToColaboradores(sql: any, sistema: string, colaboradorIds: string[], payload: PushPayload) {
  if (!ensureVapidConfigured()) return;
  const ids = [...new Set(colaboradorIds.filter(Boolean))];
  if (!ids.length) return;

  const subs = await sql.unsafe(
    `select id, endpoint, p256dh, auth, last_seen_em from public.push_subscriptions where colaborador_id = any($1::uuid[]) and sistema = $2;`,
    [ids, sistema],
  );
  await sendToSubscriptions(sql, subs, payload);
}

// deno-lint-ignore no-explicit-any
async function sendToSubscriptions(sql: any, subs: any[], payload: PushPayload) {
  if (!subs.length) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body || undefined,
    url: payload.url || undefined,
  });

  await Promise.all(
    // deno-lint-ignore no-explicit-any
    subs.map(async (sub: any) => {
      if (sub.last_seen_em && Date.now() - new Date(sub.last_seen_em).getTime() < HEARTBEAT_ATIVO_MS) {
        return;
      }

      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, body);
      } catch (error) {
        const statusCode = (error as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Inscricao expirada/revogada pelo navegador -- limpa pra nao tentar de novo.
          await sql.unsafe(`delete from public.push_subscriptions where id = $1;`, [sub.id]);
        } else {
          console.error('Push send failed:', { endpoint: sub.endpoint, message: (error as Error)?.message });
        }
      }
    }),
  );
}
