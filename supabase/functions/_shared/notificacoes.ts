// Notificacoes in-app (sino) genericas e cross-app -- tabela `notificacoes.notificacoes`, separada
// por `sistema` (slug de public.sistemas). Qualquer *-api que queira avisar um colaborador chama
// `notificar()` com o proprio `sql` (postgres.js): grava o sino e, se pedido, ja empurra Web Push
// (`_shared/push.ts`). Cada app so decide QUEM recebe e QUANDO -- gravacao, push, leitura
// (`notificacoes-api`), Realtime e limpeza (cron `notificacoes-cleanup-daily`) sao compartilhados.
// Mesmo espirito de `_shared/email.ts#enqueueEmail`.
import { sendPushToColaboradores } from './push.ts';

// deno-lint-ignore no-explicit-any
type Sql = any;

export interface NotificarInput {
  sistema: string;
  destinatarios: unknown[];
  titulo: string;
  mensagem?: string | null;
  link?: string | null;
  tipo?: string;
  referenciaTipo?: string | null;
  referenciaId?: unknown;
  criadoPor?: string | null;
  // Normalmente o autor da acao -- ninguem precisa ser avisado do que acabou de fazer.
  excluir?: unknown[];
  // Tambem empurra Web Push (app fechado/em background) pros dispositivos inscritos naquele
  // sistema. Reservar pra eventos que merecem interromper o usuario, nao pra toda edicao.
  push?: boolean;
}

function uniqIds(values: unknown[]) {
  return Array.from(new Set(values.map((item) => String(item || '').trim()).filter(Boolean)));
}

function clampLimit(value: unknown, fallback = 20, max = 50) {
  return Math.min(Math.max(Number(value) || fallback, 1), max);
}

export async function notificar(sql: Sql, input: NotificarInput) {
  const excluidos = new Set(uniqIds(input.excluir || []));
  const destinatarios = uniqIds(input.destinatarios).filter((id) => !excluidos.has(id));
  if (!input.sistema || !input.titulo || destinatarios.length === 0) return { destinatarios: [] };

  const referenciaId = String(input.referenciaId || '').trim() || null;

  await sql.unsafe(
    `
      insert into notificacoes.notificacoes (
        sistema, colaborador_id, tipo, titulo, mensagem, link, referencia_tipo, referencia_id, criado_por
      )
      select $1, unnest($2::uuid[]), $3, $4, $5, $6, $7, $8::uuid, $9::uuid;
    `,
    [
      input.sistema,
      destinatarios,
      input.tipo || 'geral',
      input.titulo,
      input.mensagem || null,
      input.link || null,
      input.referenciaTipo || null,
      referenciaId,
      input.criadoPor || null,
    ],
  );

  if (input.push) {
    // Nao derruba o fluxo principal se o push falhar -- o sino ja foi gravado.
    await sendPushToColaboradores(sql, input.sistema, destinatarios, {
      title: input.titulo,
      body: input.mensagem || null,
      url: input.link || null,
    }).catch((error) => console.error('sendPushToColaboradores failed:', error));
  }

  return { destinatarios };
}

// Formato devolvido ao frontend (consumido por `@macom/notifications`).
export function mapNotificacao(row: Record<string, unknown>) {
  return {
    id: row.id,
    sistema: row.sistema,
    collaborator_id: row.colaborador_id,
    type: row.tipo || 'geral',
    title: row.titulo,
    message: row.mensagem || '',
    link: row.link || null,
    reference_type: row.referencia_tipo || null,
    reference_id: row.referencia_id || null,
    read_at: row.lida_em || null,
    created_by_id: row.criado_por || null,
    created_date: row.criado_em,
    read: Boolean(row.lida_em),
  };
}

export async function listarNotificacoes(sql: Sql, sistema: string, colaboradorId: string, limit?: unknown) {
  const [rows, countRows] = await Promise.all([
    sql.unsafe(
      `
        select *
        from notificacoes.notificacoes
        where colaborador_id = $1::uuid and sistema = $2
        order by criado_em desc
        limit $3;
      `,
      [colaboradorId, sistema, clampLimit(limit)],
    ),
    sql.unsafe(
      `
        select count(*)::int as total
        from notificacoes.notificacoes
        where colaborador_id = $1::uuid and sistema = $2 and lida_em is null;
      `,
      [colaboradorId, sistema],
    ),
  ]);

  return {
    items: (rows as Record<string, unknown>[]).map(mapNotificacao),
    unread_count: Number(countRows[0]?.total || 0),
  };
}

// Sempre escopado ao colaborador da requisicao -- o id da notificacao sozinho nunca basta.
export async function marcarNotificacaoLida(sql: Sql, sistema: string, colaboradorId: string, id: string) {
  const rows = await sql.unsafe(
    `
      update notificacoes.notificacoes
      set lida_em = coalesce(lida_em, now())
      where id = $1::uuid and colaborador_id = $2::uuid and sistema = $3
      returning *;
    `,
    [id, colaboradorId, sistema],
  );
  return rows[0] ? mapNotificacao(rows[0]) : null;
}

export async function marcarTodasNotificacoesLidas(sql: Sql, sistema: string, colaboradorId: string) {
  await sql.unsafe(
    `
      update notificacoes.notificacoes
      set lida_em = now()
      where colaborador_id = $1::uuid and sistema = $2 and lida_em is null;
    `,
    [colaboradorId, sistema],
  );
  return { success: true };
}
