// Cron job (pg_cron, ver migration schedule_intranet_notifica_aniversariante): roda 1x por dia e
// envia um e-mail de parabens para cada colaborador ativo que faz aniversario na data. A data de
// nascimento e a foto de perfil ja vivem em public.colaboradores (schema global, ja usado pelo
// intranet-api para outras telas) -- nao ha duplicacao de cadastro aqui. Function dedicada (nao uma
// action de intranet-api) porque quem chama e o pg_cron via net.http_post, sem JWT de usuario --
// mesmo padrao de processa-fila-email e servicos-lembrete-aprovacoes.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { enqueueEmail } from '../_shared/email.ts';
import { createSql } from '../_shared/db.ts';

const TIPO_EMAIL = 'aniversario_colaborador';

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Erro inesperado';
  }
}

function primeiroNome(nomeCompleto: string) {
  return String(nomeCompleto || '').trim().split(/\s+/)[0] || nomeCompleto;
}

function montarCorpoEmail(nome: string, fotoUrl: string | null) {
  const nomeExibido = primeiroNome(nome);

  const bodyText = `Feliz aniversario, ${nomeExibido}!\n\nToda a equipe MACOM deseja a voce um dia incrivel, cheio de alegria e realizacoes. Obrigado por fazer parte da nossa historia!\n\nEquipe MACOM`;

  const fotoHtml = fotoUrl
    ? `<img src="${fotoUrl}" alt="${nomeExibido}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;margin-bottom:16px;" />`
    : '';

  const bodyHtml = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;text-align:center;">
      ${fotoHtml}
      <h1 style="color:#2d2d2d;font-size:22px;">🎉 Feliz aniversário, ${nomeExibido}!</h1>
      <p style="color:#555;font-size:15px;line-height:1.5;">
        Toda a equipe MACOM deseja a você um dia incrível, cheio de alegria e realizações.
        Obrigado por fazer parte da nossa história!
      </p>
      <p style="color:#999;font-size:12px;margin-top:24px;">Equipe MACOM</p>
    </div>
  `.trim();

  return { bodyText, bodyHtml };
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

  const sql = createSql(databaseUrl, { max: 2 });

  try {
    const aniversariantes = await sql.unsafe(
      `
        select id, nome, email, foto_url
        from public.colaboradores
        where status = 'ativo'
          and email is not null
          and data_nascimento is not null
          and extract(day from data_nascimento) = extract(day from current_date)
          and extract(month from data_nascimento) = extract(month from current_date);
      `,
    );

    const notificados: string[] = [];
    const ignorados: string[] = [];

    for (const colaborador of aniversariantes) {
      // Dedup: evita reenviar se a function rodar de novo no mesmo dia (redeploy, disparo manual etc.).
      const jaEnviado = await sql.unsafe(
        `
          select 1
          from notificacoes.fila_emails
          where tipo = $1
            and destinatario = $2
            and criado_em::date = current_date
          limit 1;
        `,
        [TIPO_EMAIL, colaborador.email],
      );

      if (jaEnviado.length > 0) {
        ignorados.push(colaborador.email as string);
        continue;
      }

      const { bodyText, bodyHtml } = montarCorpoEmail(colaborador.nome as string, colaborador.foto_url as string | null);

      await enqueueEmail(sql, {
        tipo: TIPO_EMAIL,
        destinatario: colaborador.email as string,
        assunto: `🎉 Feliz aniversário, ${primeiroNome(colaborador.nome as string)}!`,
        bodyText,
        bodyHtml,
      });

      notificados.push(colaborador.email as string);
    }

    return new Response(
      JSON.stringify({ success: true, notificados, ignorados_ja_enviados_hoje: ignorados }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('intranet-notifica-aniversariante error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
