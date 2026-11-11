// Cron job (pg_cron, ver migration schedule_security_alerta_picos_login): roda a cada 15 minutos.
// Item 5 do plano de forca bruta (SECURITY_AUDIT.md) -- detecta picos de tentativas de login
// falhas (gestao_plataforma.logs_acesso, evento = 'login_falha', gravado por
// security-log-failed-login) por IP e por e-mail-alvo, e envia e-mail para os admins via a fila
// ja existente (notificacoes.fila_emails / processa-fila-email), sem criar um novo pipeline de
// envio. Chamado sem JWT de usuario -- mesmo padrao de servicos-lembrete-aprovacoes.
import { buildCorsHeaders } from '../_shared/cors.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const JANELA_MINUTOS = 15;
const LIMITE_POR_IP = 8;
const LIMITE_POR_EMAIL = 5;
const COOLDOWN_MINUTOS = 60; // nao repete o mesmo alerta (mesma chave) dentro desse intervalo

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro inesperado';
  }
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const INTERNAL_INVOKE_SECRET = Deno.env.get('INTERNAL_INVOKE_SECRET');
  if (!INTERNAL_INVOKE_SECRET || request.headers.get('x-invoke-secret') !== INTERNAL_INVOKE_SECRET) {
    return new Response(JSON.stringify({ success: false, error: 'Nao autorizado.' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const databaseUrl = Deno.env.get('DATABASE_URL');
  if (!databaseUrl) {
    return new Response(JSON.stringify({ success: false, error: 'DATABASE_URL nao configurada.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 2, idle_timeout: 5, connect_timeout: 15 });

  try {
    const porIp = await sql.unsafe(
      `
        select host(ip_address) as chave, count(*) as tentativas
        from gestao_plataforma.logs_acesso
        where evento = 'login_falha'
          and ip_address is not null
          and criado_em > now() - interval '${JANELA_MINUTOS} minutes'
        group by ip_address
        having count(*) >= ${LIMITE_POR_IP};
      `,
    );

    const porEmail = await sql.unsafe(
      `
        select lower(metadados->>'email') as chave, count(*) as tentativas
        from gestao_plataforma.logs_acesso
        where evento = 'login_falha'
          and metadados->>'email' is not null
          and criado_em > now() - interval '${JANELA_MINUTOS} minutes'
        group by lower(metadados->>'email')
        having count(*) >= ${LIMITE_POR_EMAIL};
      `,
    );

    const candidatos = [
      ...porIp.map((row: Record<string, unknown>) => ({ tipo: 'ip', chave: String(row.chave), tentativas: Number(row.tentativas) })),
      ...porEmail.map((row: Record<string, unknown>) => ({ tipo: 'email', chave: String(row.chave), tentativas: Number(row.tentativas) })),
    ];

    if (candidatos.length === 0) {
      return new Response(JSON.stringify({ success: true, alertas_enviados: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const admins = await sql.unsafe(
      `select email from public.colaboradores where funcao = 'admin' and status <> 'inativo' and email is not null;`,
    );
    const destinatarios = admins.map((row: Record<string, unknown>) => String(row.email)).filter(Boolean);

    let alertasEnviados = 0;

    for (const candidato of candidatos) {
      const jaAlertado = await sql.unsafe(
        `
          select 1
          from gestao_plataforma.alertas_seguranca_enviados
          where tipo = $1::text
            and chave = $2::text
            and criado_em > now() - interval '${COOLDOWN_MINUTOS} minutes'
          limit 1;
        `,
        [candidato.tipo, candidato.chave],
      );

      if (jaAlertado.length > 0 || destinatarios.length === 0) continue;

      const descricao =
        candidato.tipo === 'ip'
          ? `IP ${candidato.chave}`
          : `conta ${candidato.chave}`;
      const assunto = `[MACOM] Pico de tentativas de login falhas — ${descricao}`;
      const corpo = `Foram registradas ${candidato.tentativas} tentativas de login falhas para ${descricao} nos ultimos ${JANELA_MINUTOS} minutos.\n\nVerifique gestao_plataforma.logs_acesso (evento = 'login_falha') para mais detalhes.`;

      for (const destinatario of destinatarios) {
        await sql.unsafe(
          `
            insert into notificacoes.fila_emails (tipo, destinatario, assunto, payload)
            values ('alerta_seguranca_login', $1::text, $2::text, jsonb_build_object('to', $1::text, 'subject', $2::text, 'body_text', $3::text));
          `,
          [destinatario, assunto, corpo],
        );
      }

      await sql.unsafe(
        `insert into gestao_plataforma.alertas_seguranca_enviados (tipo, chave) values ($1::text, $2::text);`,
        [candidato.tipo, candidato.chave],
      );

      alertasEnviados += 1;
    }

    return new Response(JSON.stringify({ success: true, alertas_enviados: alertasEnviados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('security-alerta-picos-login error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
