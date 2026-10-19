// Cron job (pg_cron, ver migration schedule_crm_veiculos_estoque_expira_reserva): roda a cada 15
// minutos e libera reservas de veiculo em estoque (gestao_crm.veiculos_estoque) cujo
// reserva_expira_em (20261019120100) ja passou. Function dedicada (nao uma action de crm-api)
// porque quem chama e o pg_cron via net.http_post, sem JWT de usuario -- mesmo padrao de
// intranet-notifica-aniversariante/processa-fila-email. Grava 'expirado' no historico
// (veiculos_estoque_historico_reserva) e notifica o vendedor que perdeu a reserva, na mesma
// transacao do update -- mantem a logica de negocio de reserva centralizada (nunca via trigger
// generica), igual a action veiculo_estoque_reserva do crm-api.
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { notificar } from '../_shared/notificacoes.ts';

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
    const expiradas = await sql.unsafe(
      `
        select id, vendedor_reserva_id, cliente_reserva_id
        from gestao_crm.veiculos_estoque
        where status = 'reservado'
          and reserva_expira_em is not null
          and reserva_expira_em < now();
      `,
    );

    const processadas: string[] = [];

    for (const veiculo of expiradas) {
      await sql.begin(async (transaction) => {
        await transaction.unsafe(
          `update gestao_crm.veiculos_estoque set status = 'disponivel' where id = $1;`,
          [veiculo.id],
        );

        await transaction.unsafe(
          `
            insert into gestao_crm.veiculos_estoque_historico_reserva (
              veiculo_estoque_id, acao, vendedor_anterior_id, cliente_anterior_id
            ) values ($1, 'expirado', $2, $3);
          `,
          [veiculo.id, veiculo.vendedor_reserva_id, veiculo.cliente_reserva_id],
        );
      });

      if (veiculo.vendedor_reserva_id) {
        await notificar(sql, {
          sistema: 'crm',
          destinatarios: [veiculo.vendedor_reserva_id],
          titulo: 'Reserva de veiculo expirada',
          mensagem: 'A reserva deste veiculo expirou e ele voltou a ficar disponivel no estoque.',
          tipo: 'reserva_veiculo_expirada',
          referenciaTipo: 'veiculo_estoque',
          referenciaId: veiculo.id,
        }).catch((error) => console.error('notificar (reserva expirada) failed:', error));
      }

      processadas.push(veiculo.id as string);
    }

    return new Response(
      JSON.stringify({ success: true, processadas }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('crm-veiculos-estoque-expira-reserva error:', error);
    return new Response(JSON.stringify({ success: false, error: getErrorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
});
