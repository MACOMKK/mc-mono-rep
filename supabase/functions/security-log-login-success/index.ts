// Chamada pelo frontend logo apos supabase.auth.signInWithPassword ter sucesso -- simetrica a
// security-log-failed-login. Alimenta gestao_plataforma.logs_acesso (evento = 'login_sucesso'),
// usada por security-check-login-lock para resetar o contador de falhas do fallback de lockout
// client-side (item 3 do plano de forca bruta -- o Auth Hook nativo "Password Verification
// Attempt" exige plano Team/Enterprise do Supabase, ainda nao disponivel neste projeto, ver
// SECURITY_AUDIT.md).
//
// IMPORTANTE: o e-mail NUNCA vem do body -- viria de um campo que qualquer chamador anonimo
// controla, e um evento 'login_sucesso' falso reseta o contador de falhas usado pelo lockout
// (achado de review de seguranca: sem essa checagem, um atacante conseguia chamar esta function
// repetidamente com o e-mail da vitima para zerar o lockout dela enquanto atacava a senha de
// verdade em paralelo). O e-mail e sempre derivado do token de acesso da sessao que acabou de
// ser criada (supabase.auth.getUser()), validado contra o proprio Supabase Auth.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
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

  const respondOk = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const databaseUrl = Deno.env.get('DATABASE_URL');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!databaseUrl || !supabaseUrl || !supabaseAnonKey) return respondOk();

  let sql;
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await authClient.auth.getUser();
    // Sem sessao valida = nao houve login bem-sucedido nenhum para registrar.
    if (!user?.email) return respondOk();

    const rawBody = await request.json().catch(() => ({}));
    const body = loginTelemetryBodySchema.parse(rawBody);
    const sistemaSlug = typeof body.sistema_slug === 'string' ? body.sistema_slug.trim().slice(0, 60) : '';
    if (!sistemaSlug) return respondOk();

    sql = createSql(databaseUrl, { max: 2, connectTimeout: 10 });

    await sql.unsafe(
      `
        insert into gestao_plataforma.logs_acesso (colaborador_id, sistema_id, evento, ip_address, user_agent, metadados)
        select null, s.id, 'login_sucesso', $1::inet, $2::text, jsonb_build_object('email', $3::text)
        from public.sistemas s
        where s.slug = $4::text;
      `,
      [getClientIp(request) || null, request.headers.get('user-agent') || null, user.email.toLowerCase(), sistemaSlug],
    );
  } catch (error) {
    console.error('security-log-login-success error:', error);
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => {});
  }

  return respondOk();
});
