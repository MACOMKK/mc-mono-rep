// Fallback client-side do lockout por conta (item 3 do plano de forca bruta, SECURITY_AUDIT.md).
// O mecanismo nativo do Supabase para isso (Auth Hook "Password Verification Attempt", roda
// dentro do proprio GoTrue e nao pode ser contornado) exige plano Team/Enterprise -- este projeto
// esta no plano padrao, entao esse hook nao pode ser habilitado. Este fallback e chamado pelo
// frontend ANTES de tentar supabase.auth.signInWithPassword: se a conta estiver "travada" pelo
// historico de falhas recentes em gestao_plataforma.logs_acesso, o app nem tenta o login.
//
// Limitacao conhecida (documentada em SECURITY_AUDIT.md): um atacante que ataque a API do
// Supabase Auth diretamente, sem passar pelo app, nunca chama esta funcao -- entao esse caminho
// nao e protegido por este fallback (fica coberto pelo rate limit nativo por IP, item 2, e pelo
// CAPTCHA, item 1). Este endpoint protege quem usa o app normalmente.
//
// Calculo sem tabela de estado propria: conta falhas (evento = 'login_falha') desde o ultimo
// sucesso (evento = 'login_sucesso') ou dos ultimos 30 minutos, o que for mais recente -- mesmos
// limiares do hook nativo (nao usado ainda): 5 -> 1min, 10 -> 5min, 15 -> 30min, 20+ -> 1h.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { loginTelemetryBodySchema } from '../_shared/validation.ts';
import { createSql } from '../_shared/db.ts';

const JANELA_MINUTOS = 30;

function segundosBloqueioPara(totalFalhas: number) {
  if (totalFalhas >= 20) return 3600;
  if (totalFalhas >= 15) return 1800;
  if (totalFalhas >= 10) return 300;
  if (totalFalhas >= 5) return 60;
  return 0;
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Fail-open: qualquer erro aqui nunca deve impedir um login legitimo.
  const respondNaoTravado = () =>
    new Response(JSON.stringify({ locked: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const databaseUrl = Deno.env.get('DATABASE_URL');
  if (!databaseUrl) return respondNaoTravado();

  let sql;
  try {
    const rawBody = await request.json().catch(() => ({}));
    const body = loginTelemetryBodySchema.parse(rawBody);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : '';
    if (!email) return respondNaoTravado();

    sql = createSql(databaseUrl, { max: 2, connectTimeout: 10 });

    const rows = await sql.unsafe(
      `
        with ultimo_sucesso as (
          select max(criado_em) as em
          from gestao_plataforma.logs_acesso
          where evento = 'login_sucesso' and lower(metadados->>'email') = $1::text
        ),
        falhas as (
          select criado_em
          from gestao_plataforma.logs_acesso, ultimo_sucesso
          where evento = 'login_falha'
            and lower(metadados->>'email') = $1::text
            and criado_em > greatest(coalesce(ultimo_sucesso.em, now() - interval '${JANELA_MINUTOS} minutes'), now() - interval '${JANELA_MINUTOS} minutes')
        )
        select count(*)::int as total, max(criado_em) as ultima_falha from falhas;
      `,
      [email],
    );

    const total = Number(rows?.[0]?.total || 0);
    const ultimaFalha = rows?.[0]?.ultima_falha ? new Date(rows[0].ultima_falha) : null;
    const segundos = segundosBloqueioPara(total);

    if (segundos > 0 && ultimaFalha) {
      const bloqueadoAte = new Date(ultimaFalha.getTime() + segundos * 1000);
      const restante = Math.ceil((bloqueadoAte.getTime() - Date.now()) / 1000);
      if (restante > 0) {
        return new Response(JSON.stringify({ locked: true, retry_after_seconds: restante }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return respondNaoTravado();
  } catch (error) {
    console.error('security-check-login-lock error:', error);
    return respondNaoTravado();
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(() => {});
  }
});
