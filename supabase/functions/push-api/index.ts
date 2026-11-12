// Edge Function generica de Web Push, compartilhada por todos os apps do monorepo -- so cuida
// de cadastrar/remover a inscricao do navegador (`public.push_subscriptions`). Quem dispara o
// envio de verdade e `sendPushToColaborador` (supabase/functions/_shared/push.ts), chamado de
// dentro da `-api` de cada app (ver `servicos-api` -> `insertNotificacao`), nao daqui -- esta
// function nao sabe nada de regra de negocio de nenhum app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

// max explicito: sem ele o postgres.js abre ate 10 conexoes por instancia, e o pool do
// Supavisor (15) e dividido por todas as functions. Mesmo padrao das demais functions.
const sql = databaseUrl
  ? postgres(databaseUrl, { prepare: false, max: 2, idle_timeout: 5, connect_timeout: 15 })
  : null;

function jsonResponse(data: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function getBearerToken(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  return authHeader.replace('Bearer ', '').trim();
}

async function getAuthenticatedUser(token: string) {
  if (!token) throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  if (!supabaseUrl || !supabaseAnonKey) throw Object.assign(new Error('Supabase nao configurado.'), { status: 500 });

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  return data.user;
}

async function getCurrentCollaboradorId(user: { id: string; email?: string }) {
  if (!sql) return null;
  const rows = await sql.unsafe(
    `select id from public.colaboradores where id = $1 or lower(email) = lower($2) limit 1;`,
    [user.id, user.email || ''],
  );
  return rows[0]?.id || null;
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (data: unknown, status = 200) => jsonResponse(data, status, corsHeaders);

  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Metodo nao suportado.' }, 405);
  if (!sql) return json({ error: 'Banco de dados nao configurado.' }, 500);

  try {
    const token = getBearerToken(request);
    const user = await getAuthenticatedUser(token);
    const colaboradorId = await getCurrentCollaboradorId(user);
    if (!colaboradorId) throw Object.assign(new Error('Colaborador nao encontrado.'), { status: 403 });

    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;
    const sistema = String(body.sistema || '').trim();
    if (!sistema) throw Object.assign(new Error('Informe o sistema.'), { status: 400 });

    if (action === 'subscribe') {
      const subscription = body.subscription as
        | { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
        | undefined;
      const endpoint = subscription?.endpoint;
      const p256dh = subscription?.keys?.p256dh;
      const auth = subscription?.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        throw Object.assign(new Error('Inscricao de push invalida.'), { status: 400 });
      }

      const userAgent = request.headers.get('user-agent') || null;
      // Dado estruturado detectado no client (User-Agent Client Hints com fallback pra parse de
      // user-agent, ver packages/push/src/pushClient.js -> detectarDispositivo) -- mais confiavel
      // que reinterpretar o user_agent bruto toda vez que a lista e exibida (Configuracoes.jsx).
      const dispositivo = body.dispositivo as
        | { tipoDispositivo?: string; sistemaOperacional?: string; navegador?: string }
        | undefined;
      const tipoDispositivo = dispositivo?.tipoDispositivo || null;
      const sistemaOperacional = dispositivo?.sistemaOperacional || null;
      const navegador = dispositivo?.navegador || null;

      // Limpa inscricoes antigas do mesmo colaborador+sistema+navegador antes de gravar a nova --
      // o navegador troca de endpoint ao reautorizar notificacoes (ex. depois de mexer em
      // permissao do SO), e sem isso a linha antiga fica orfa (sendPushToColaborador manda pra
      // ela tambem, sem garantia de que o navegador ainda esteja ouvindo aquele endpoint).
      await sql.unsafe(
        `delete from public.push_subscriptions
         where colaborador_id = $1 and sistema = $2 and user_agent = $3 and endpoint <> $4;`,
        [colaboradorId, sistema, userAgent, endpoint],
      );

      await sql.unsafe(
        `
          insert into public.push_subscriptions
            (colaborador_id, sistema, endpoint, p256dh, auth, user_agent, tipo_dispositivo, sistema_operacional, navegador)
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          on conflict (sistema, endpoint)
          do update set
            colaborador_id = excluded.colaborador_id,
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            tipo_dispositivo = excluded.tipo_dispositivo,
            sistema_operacional = excluded.sistema_operacional,
            navegador = excluded.navegador;
        `,
        [colaboradorId, sistema, endpoint, p256dh, auth, userAgent, tipoDispositivo, sistemaOperacional, navegador],
      );
      return json({ ok: true });
    }

    if (action === 'heartbeat') {
      // Chamado periodicamente pelo app enquanto a aba esta visivel/em foco (ver
      // packages/push/src/usePushNotifications.js) -- sendPushToColaborador usa esse timestamp
      // pra pular o push nesse dispositivo especifico quando ele ja esta com o app aberto na
      // tela (o toast in-app via Realtime ja avisa, o push nativo so duplicaria).
      const endpoint = String(body.endpoint || '').trim();
      if (!endpoint) throw Object.assign(new Error('Informe o endpoint.'), { status: 400 });

      await sql.unsafe(
        `update public.push_subscriptions set last_seen_em = now() where sistema = $1 and endpoint = $2 and colaborador_id = $3;`,
        [sistema, endpoint, colaboradorId],
      );
      return json({ ok: true });
    }

    if (action === 'heartbeat_clear') {
      // Chamado na hora que a aba fica oculta (visibilitychange) ou a pagina descarrega
      // (pagehide) -- zera o last_seen_em na hora, em vez de deixar o push suprimido ate o
      // heartbeat anterior envelhecer sozinho (ate 35s de espera desnecessaria, ver
      // HEARTBEAT_ATIVO_MS em _shared/push.ts).
      const endpoint = String(body.endpoint || '').trim();
      if (!endpoint) throw Object.assign(new Error('Informe o endpoint.'), { status: 400 });

      await sql.unsafe(
        `update public.push_subscriptions set last_seen_em = null where sistema = $1 and endpoint = $2 and colaborador_id = $3;`,
        [sistema, endpoint, colaboradorId],
      );
      return json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '').trim();
      if (!endpoint) throw Object.assign(new Error('Informe o endpoint.'), { status: 400 });

      await sql.unsafe(
        `delete from public.push_subscriptions where sistema = $1 and endpoint = $2 and colaborador_id = $3;`,
        [sistema, endpoint, colaboradorId],
      );
      return json({ ok: true });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const status = (error as { status?: number })?.status || 500;
    const message = (error as Error)?.message || 'Erro inesperado.';
    if (status >= 500) console.error('push-api error:', message);
    return json({ error: message }, status);
  }
});
