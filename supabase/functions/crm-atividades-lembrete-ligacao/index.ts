// Cron job (pg_cron, ver migration schedule_crm_atividades_lembrete_ligacao): roda a cada 15
// minutos e notifica o vendedor responsavel quando uma atividade de "ligacao" planejada
// (gestao_crm.atendimentos, horario_proximo_contato preenchido em 20261021120000) esta chegando no
// horario marcado. Function dedicada (nao action de crm-api) porque quem chama e o pg_cron via
// net.http_post, sem JWT de usuario -- mesmo padrao de crm-veiculos-estoque-expira-reserva. Dedupe
// de reenvio via lembrete_ligacao_enviado_em (zerado pelo trigger quando a atividade e remarcada).
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { notificar } from '../_shared/notificacoes.ts';

const JANELA_LEMBRETE_MINUTOS = 30;

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
    const pendentes = await sql.unsafe(
      `
        select a.id, a.titulo, a.proximo_contato, a.horario_proximo_contato, l.responsavel_id
        from gestao_crm.atendimentos a
        join gestao_crm.leads l on l.id = a.lead_id
        where a.tipo_atendimento = 'ligacao'
          and a.status = 'planejada'
          and a.horario_proximo_contato is not null
          and a.lembrete_ligacao_enviado_em is null
          and l.responsavel_id is not null
          and (a.proximo_contato + a.horario_proximo_contato) at time zone 'America/Fortaleza'
                between now() and now() + interval '${JANELA_LEMBRETE_MINUTOS} minutes';
      `,
    );

    const processadas: string[] = [];

    for (const atendimento of pendentes) {
      const horario = String(atendimento.horario_proximo_contato).slice(0, 5);

      await notificar(sql, {
        sistema: 'crm',
        destinatarios: [atendimento.responsavel_id],
        titulo: 'Ligacao agendada em breve',
        mensagem: `"${atendimento.titulo}" esta marcada para ${horario}.`,
        tipo: 'lembrete_ligacao',
        referenciaTipo: 'atendimento',
        referenciaId: atendimento.id,
      }).catch((error) => console.error('notificar (lembrete ligacao) failed:', error));

      await sql.unsafe(
        `update gestao_crm.atendimentos set lembrete_ligacao_enviado_em = now() where id = $1;`,
        [atendimento.id],
      );

      processadas.push(atendimento.id as string);
    }

    return new Response(
      JSON.stringify({ success: true, processadas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('crm-atividades-lembrete-ligacao error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
