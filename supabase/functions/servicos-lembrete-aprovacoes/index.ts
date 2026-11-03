// Cron job (pg_cron, ver migration schedule_servicos_lembrete_aprovacoes): roda de hora em hora
// e reavisa o aprovador de solicitacoes de pagamento paradas ha mais de 24h esperando decisao --
// hoje o aprovador so era notificado uma vez, na criacao/reenvio (servicos-api ->
// notifyAprovadorNovaSolicitacao), e uma solicitacao podia ficar esquecida na fila sem nenhum
// novo aviso. Function dedicada (nao uma action de servicos-api) porque quem chama e o pg_cron via
// net.http_post, sem JWT de usuario -- mesmo padrao de processa-fila-email.
import { buildCorsHeaders } from '../_shared/cors.ts';
import { sendPushToColaborador } from '../_shared/push.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const SERVICOS_SCHEMA = 'gestao_servicos';
const SERVICOS_SYSTEM_SLUG = 'servicos';
const LEMBRETE_INTERVALO_HORAS = 24;

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
    // Pendente ha mais de 24h e (nunca lembrado, ou ultimo lembrete tambem ja passou de 24h) --
    // assim o aprovador continua recebendo um reaviso periodico enquanto nao decide, em vez de um
    // unico toque que pode se perder.
    const rows = await sql.unsafe(
      `
        select sp.id, sp.fornecedor, sp.titulo, sp.valor, sp.pessoal, sp.aprovador_destino_id, c.nome as aprovador_nome
        from ${SERVICOS_SCHEMA}.solicitacoes_pagamento sp
        join public.colaboradores c on c.id = sp.aprovador_destino_id
        where sp.status = 'pendente'
          and sp.aprovador_destino_id is not null
          and sp.criado_em < now() - interval '${LEMBRETE_INTERVALO_HORAS} hours'
          and (sp.lembrete_aprovador_em is null or sp.lembrete_aprovador_em < now() - interval '${LEMBRETE_INTERVALO_HORAS} hours');
      `,
    );

    const results = [];
    for (const row of rows) {
      const valorFormatado = Number(row.valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      // Solicitacao pessoal nao tem aprovacao: o lembrete e so de que o pagamento ainda nao foi feito.
      const titulo = row.pessoal ? 'Lembrete pessoal de pagamento' : 'Solicitação aguardando sua aprovação';
      const mensagem = row.pessoal
        ? `${row.titulo} — ${valorFormatado} — ainda não marcado como pago`
        : `${row.fornecedor} — ${valorFormatado} — ainda sem decisão`;

      await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.notificacoes
            (colaborador_id, tipo, titulo, mensagem, link, referencia_tipo, referencia_id)
          values ($1, 'solicitacao_pendente_lembrete', $5, $2, $3, 'solicitacao_pagamento', $4);
        `,
        [row.aprovador_destino_id, mensagem, `/aprovacoes?sol=${row.id}`, String(row.id), titulo],
      );

      await sendPushToColaborador(sql, SERVICOS_SYSTEM_SLUG, String(row.aprovador_destino_id), {
        title: titulo,
        body: mensagem,
        url: `/aprovacoes?sol=${row.id}`,
      }).catch((error) => console.error('sendPushToColaborador failed:', error));

      await sql.unsafe(
        `update ${SERVICOS_SCHEMA}.solicitacoes_pagamento set lembrete_aprovador_em = now() where id = $1;`,
        [row.id],
      );

      // Mesma logica de insertNotificacao em servicos-api: deixa visivel na timeline da
      // solicitacao quem foi avisado, mesmo sendo um disparo automatico (sem autor humano).
      await sql.unsafe(
        `insert into ${SERVICOS_SCHEMA}.historico_solicitacao (solicitacao_id, evento, autor_id, observacao) values ($1, 'notificacao_enviada', null, $2);`,
        [row.id, `Lembrete enviado: ${row.aprovador_nome} (aprovador)`],
      );

      results.push({ id: row.id });
    }

    return new Response(JSON.stringify({ success: true, lembretes_enviados: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('servicos-lembrete-aprovacoes error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
