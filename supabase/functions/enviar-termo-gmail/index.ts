import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { sendGmail } from '../_shared/email.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const databaseUrl = Deno.env.get('DATABASE_URL');

const sql = databaseUrl ? postgres(databaseUrl, { prepare: false, max: 2, idle_timeout: 5, connect_timeout: 15 }) : null;

async function getAuthenticatedUser(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw Object.assign(new Error('Supabase nao configurado.'), { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();

  if (error || !data.user) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  return data.user;
}

// Resolve o colaborador autenticado e confere se ele pode mandar e-mail pelo Gmail corporativo:
// hoje o unico fluxo real e o Termo de Posse do Central (admin/gestor, ou qualquer colaborador
// com acesso ativo ao sistema "central"). Sem essa checagem, qualquer usuario logado de qualquer
// app conseguia disparar e-mail pelo remetente oficial para qualquer destinatario.
async function ensureCanSendTermo(authUser: { id: string; email?: string | null }) {
  if (!sql) {
    throw Object.assign(new Error('DATABASE_URL nao configurada.'), { status: 500 });
  }

  const normalizedEmail = typeof authUser.email === 'string' ? authUser.email.trim().toLowerCase() : null;
  const rows = await sql.unsafe(
    `
      select c.*
      from public.colaboradores c
      where c.id = $1
         or (c.email is not null and lower(trim(c.email)) = lower(trim($2)))
      limit 1;
    `,
    [authUser.id, normalizedEmail || ''],
  );

  const collaborator = rows[0];
  if (!collaborator || collaborator.status === 'inativo') {
    throw Object.assign(new Error('Colaborador nao encontrado ou inativo.'), { status: 403 });
  }

  if (collaborator.funcao === 'admin' || collaborator.funcao === 'gestor') {
    return collaborator;
  }

  const acessoRows = await sql.unsafe(
    `
      select 1
      from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = $1
        and aus.ativo = true
        and s.slug = 'central'
        and s.ativo = true
      limit 1;
    `,
    [collaborator.id],
  );

  if (!acessoRows[0]) {
    throw Object.assign(new Error('Seu usuario nao tem acesso liberado para este envio.'), { status: 403 });
  }

  return collaborator;
}

// O unico chamador hoje (TermsPossession.jsx) sempre manda o e-mail do proprio colaborador do
// termo. Exigir que `to` seja um e-mail de colaborador ativo evita que o payload seja usado para
// mandar e-mail (com cabecalhos forjados) para qualquer destinatario externo.
async function ensureValidRecipient(to: string) {
  if (!sql) {
    throw Object.assign(new Error('DATABASE_URL nao configurada.'), { status: 500 });
  }

  const normalized = to.trim().toLowerCase();
  if (!normalized || /[\r\n]/.test(normalized)) {
    throw Object.assign(new Error('Destinatario invalido.'), { status: 400 });
  }

  const rows = await sql.unsafe(
    `select 1 from public.colaboradores where lower(trim(email)) = $1 and status <> 'inativo' limit 1;`,
    [normalized],
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Destinatario precisa ser um colaborador ativo.'), { status: 400 });
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro inesperado';
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    await ensureCanSendTermo(user);

    const payload = await req.json().catch(() => ({}));
    if (typeof payload.to === 'string') {
      await ensureValidRecipient(payload.to);
    }

    const gmailId = await sendGmail(payload, {
      supabaseUrl,
      serviceRoleKey: supabaseServiceRoleKey,
    });

    return new Response(JSON.stringify({ success: true, gmail_id: gmailId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('enviar-termo-gmail error:', error);
    const status = typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 400;
    return new Response(
      JSON.stringify({
        success: false,
        error: getErrorMessage(error),
      }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
