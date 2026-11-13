// Chamada pelo frontend (packages/api-client/src/supabaseClient.js -> reportFailedLogin) logo
// apos supabase.auth.signInWithPassword falhar por credencial invalida. Sem JWT de usuario (login
// falhou, nao ha sessao) -- supabase-js assina a chamada com a anon key, que passa no verify_jwt
// padrao do projeto mesmo sem usuario autenticado (mesmo mecanismo usado por
// processa-fila-email/servicos-lembrete-aprovacoes, chamados via pg_cron com a anon key).
// Alimenta gestao_plataforma.logs_acesso (evento = 'login_falha'), consumido pelo cron
// security-alerta-picos-login para detectar picos de tentativas.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { loginTelemetryBodySchema } from '../_shared/validation.ts';
import { createSql } from '../_shared/db.ts';

function normalizeForwardedIp(value: string | null) {
  if (!value) return null;
  const first = value.split(',').map((item) => item.trim()).find(Boolean);
  if (!first) return null;
  if (first.startsWith('[') && first.includes(']')) {
    return first.slice(1, first.indexOf(']'));
  }
  const forwarded = first.match(/for="?([^";,\s]+)"?/i)?.[1] || first;
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(forwarded)) {
    return forwarded.slice(0, forwarded.lastIndexOf(':'));
  }
  return forwarded.replace(/^"|"$/g, '');
}

function getClientIp(request: Request) {
  return (
    normalizeForwardedIp(request.headers.get('cf-connecting-ip')) ||
    normalizeForwardedIp(request.headers.get('x-real-ip')) ||
    normalizeForwardedIp(request.headers.get('x-forwarded-for')) ||
    normalizeForwardedIp(request.headers.get('forwarded'))
  );
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Falha silenciosa em qualquer erro: este endpoint e telemetria de seguranca, nunca deve
  // atrapalhar o fluxo de login do usuario real.
  const respondOk = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const databaseUrl = Deno.env.get('DATABASE_URL');
  if (!databaseUrl) return respondOk();

  let sql;
  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = loginTelemetryBodySchema.parse(rawBody);
    const email = typeof body.email === 'string' ? body.email.trim().slice(0, 320) : '';
    const sistemaSlug = typeof body.sistema_slug === 'string' ? body.sistema_slug.trim().slice(0, 60) : '';
    if (!email || !sistemaSlug) return respondOk();

    sql = createSql(databaseUrl, { max: 2, connectTimeout: 10 });

    await sql.unsafe(
      `
        insert into gestao_plataforma.logs_acesso (colaborador_id, sistema_id, evento, ip_address, user_agent, metadados)
        select null, s.id, 'login_falha', $1::inet, $2::text, jsonb_build_object('email', $3::text)
        from public.sistemas s
        where s.slug = $4::text;
      `,
      [getClientIp(request) || null, request.headers.get('user-agent') || null, email.toLowerCase(), sistemaSlug],
    );
  } catch (error) {
    console.error('security-log-failed-login error:', error);
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => {});
  }

  return respondOk();
});
