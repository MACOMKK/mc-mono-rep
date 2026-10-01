// Edge Function generica do sino (notificacoes in-app), compartilhada por todos os apps do
// monorepo -- so cuida de LER e MARCAR COMO LIDA as notificacoes do proprio colaborador
// (`notificacoes.notificacoes`, separadas por `sistema`). Quem grava e `notificar()`
// (supabase/functions/_shared/notificacoes.ts), chamado de dentro da `-api` de cada app -- esta
// function nao sabe nada de regra de negocio de nenhum app. Mesmo papel da `push-api` pro Web Push.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import {
  listarNotificacoes,
  marcarNotificacaoLida,
  marcarTodasNotificacoesLidas,
} from '../_shared/notificacoes.ts';

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

const sql = databaseUrl ? postgres(databaseUrl, { prepare: false }) : null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

// Mesma resolucao de public.current_colaborador_id() (usada na RLS da tabela): id do auth
// primeiro, email como fallback.
async function getCurrentCollaboradorId(user: { id: string; email?: string }) {
  if (!sql) return null;
  const rows = await sql.unsafe(
    `
      select id from public.colaboradores
      where id = $1 or lower(email) = lower($2)
      order by case when id = $1 then 0 else 1 end
      limit 1;
    `,
    [user.id, user.email || ''],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
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

    if (action === 'list') {
      return json({ data: await listarNotificacoes(sql, sistema, colaboradorId, body.limit) });
    }

    if (action === 'mark_read') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) throw Object.assign(new Error('Notificacao invalida.'), { status: 400 });
      return json({ data: await marcarNotificacaoLida(sql, sistema, colaboradorId, id) });
    }

    if (action === 'mark_all_read') {
      return json({ data: await marcarTodasNotificacoesLidas(sql, sistema, colaboradorId) });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const status = (error as { status?: number })?.status || 500;
    const message = (error as Error)?.message || 'Erro inesperado.';
    if (status >= 500) console.error('notificacoes-api error:', message);
    return json({ error: message }, status);
  }
});
