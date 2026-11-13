// Cliente Postgres (postgres.js) padrao de TODAS as Edge Functions -- nunca chame `postgres()` direto.
//
// Por que: o DATABASE_URL aponta para o pooler compartilhado (Supavisor) em transaction mode (:6543).
// O postgres.js faz *pipelining* por padrao (manda a proxima query na mesma conexao antes de a
// anterior terminar) sempre que a instancia tem mais queries simultaneas que `max`. Com o pooler em
// transaction mode isso trava queries ou devolve linhas trocadas -- aviso oficial em
// https://supabase.com/docs/guides/database/postgres-js. Medido aqui em 2026-11-13: queries triviais
// presas em `active / ClientRead` por ate 240 s, `invalid frontend message type` / `incomplete message`
// nos logs, e Edge Functions morrendo no limite de ~150 s (546) -- as listas "que so carregam com F5".
//
// `max_pipeline: 0` desliga o pipelining (uma query por conexao por vez), mas quebra `sql.begin()`
// (bug upstream porsager/postgres#1189: o `onexecute` do begin nunca roda). Por isso transacao e
// SEMPRE via `withTransaction()` abaixo, nunca `sql.begin()`.
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

// deno-lint-ignore no-explicit-any
type Sql = any;

export interface CreateSqlOptions {
  // Conexoes por instancia da function. O pool do Supavisor (15 no plano Nano) e dividido por todas
  // as functions, mas em transaction mode cada conexao so ocupa o pool enquanto uma query roda.
  max?: number;
  connectTimeout?: number;
  // Outras opcoes do postgres.js (ex.: max_lifetime, connection.statement_timeout). Nao conseguem
  // sobrescrever prepare/max_pipeline/idle_timeout, que sao a regra da plataforma.
  extra?: Record<string, unknown>;
}

export function createSql(databaseUrl: string, { max = 3, connectTimeout = 15, extra = {} }: CreateSqlOptions = {}): Sql {
  return postgres(databaseUrl, {
    ...extra,
    max,
    connect_timeout: connectTimeout,
    prepare: false,
    max_pipeline: 0,
    idle_timeout: 5,
  });
}

// Substitui `sql.begin(async (tx) => ...)` com a mesma semantica: commit se `fn` resolver, rollback se
// rejeitar; se `fn` devolver um array de queries, aguarda todas (como o begin). Usa uma conexao
// reservada (`sql.reserve()`), que funciona com `max_pipeline: 0`.
export async function withTransaction<T>(sql: Sql, fn: (tx: Sql) => T | Promise<T>): Promise<Awaited<T>> {
  const tx = await sql.reserve();
  try {
    await tx.unsafe('begin');
    let result: Awaited<T>;
    try {
      const value = await fn(tx);
      result = (Array.isArray(value) ? await Promise.all(value) : value) as Awaited<T>;
    } catch (error) {
      await tx.unsafe('rollback').catch(() => {});
      throw error;
    }
    // Se alguma query falhou dentro da transacao e o erro foi engolido por `fn`, o Postgres responde
    // ao COMMIT com ROLLBACK (sem erro). O `sql.begin` tambem nao deixava isso passar em silencio.
    const commit = await tx.unsafe('commit');
    if (commit?.command === 'ROLLBACK') {
      throw new Error('Transacao abortada por erro em uma das queries; nada foi gravado.');
    }
    return result;
  } finally {
    tx.release();
  }
}
