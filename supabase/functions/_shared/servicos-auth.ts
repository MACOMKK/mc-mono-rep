// Camada de autenticacao/autorizacao do sistema Servicos (Camada 1: acesso ao
// sistema em public.acessos_usuario_sistema; Camada 2: papel por modulo em
// gestao_servicos.permissoes_modulo). Extraida como COPIA da logica que ja
// existe em supabase/functions/servicos-api/index.ts, para servir tambem a
// servicos-oficina-api sem colar a mesma implementacao em cada function nova.
//
// servicos-api ainda NAO foi migrado para importar daqui -- continua com sua
// copia local intacta, para nao arriscar o deploy do Financeiro (ja em
// producao) numa entrega que e sobre o modulo Oficina. Migrar servicos-api
// pra usar este arquivo fica registrado como divida tecnica separada (ver
// apps/servicos/CLAUDE.md).
//
// Divergencia proposital em relacao a copia de servicos-api: la,
// getServicosModuleRole() retorna o literal 'financeiro' quando o colaborador
// e admin (Camada 1), porque so existe o modulo financeiro hoje. Aqui o
// bypass de admin retorna 'admin' de forma generica -- mesmo criterio da
// funcao SQL public.servicos_module_role() usada nas RLS policies -- para
// funcionar com qualquer modulo. Quem migrar servicos-api para importar
// daqui precisa ajustar isFinanceiro/isPagador la para tratar 'admin' tambem.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import type postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const SERVICOS_SCHEMA = 'gestao_servicos';
const SERVICOS_SYSTEM_SLUG = 'servicos';

export type SqlClient = ReturnType<typeof postgres>;

export function getBearerToken(request: Request) {
  const authHeader = request.headers.get('Authorization') || '';
  return authHeader.replace('Bearer ', '').trim();
}

export async function getAuthenticatedUser(
  token: string,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
) {
  if (!token) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    throw Object.assign(new Error('Supabase nao configurado.'), { status: 500 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();

  if (error || !data.user) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  return data.user;
}

export async function getCurrentCollaborator(sql: SqlClient, user: { id: string; email?: string }) {
  const rows = await sql.unsafe(
    `
      select *
      from public.colaboradores
      where id = $1
         or lower(email) = lower($2)
      order by case when id = $1 then 0 else 1 end
      limit 1;
    `,
    [user.id, user.email || ''],
  );

  return rows[0] || null;
}

export function getAccessLevel(access: Record<string, unknown> | null) {
  return String(access?.nivel_acesso || '');
}

export async function getServicosAccess(sql: SqlClient, collaboradorId: string) {
  const rows = await sql.unsafe(
    `
      select aus.*
      from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = $1
        and aus.ativo = true
        and s.slug = $2
        and s.ativo = true
      limit 1;
    `,
    [collaboradorId, SERVICOS_SYSTEM_SLUG],
  );

  return rows[0] || null;
}

export async function getServicosModuleRole(
  sql: SqlClient,
  collaboradorId: string,
  access: Record<string, unknown> | null,
  modulo: string,
) {
  const accessLevel = getAccessLevel(access);
  if (accessLevel === 'admin') return 'admin';
  if (!accessLevel) return null;

  const rows = await sql.unsafe(
    `select papel from ${SERVICOS_SCHEMA}.permissoes_modulo where colaborador_id = $1 and modulo = $2 limit 1;`,
    [collaboradorId, modulo],
  );

  return rows[0]?.papel || (modulo === 'oficina' ? 'nenhum' : 'usuario');
}

// Mesma logica de getServicosAccess + getServicosModuleRole acima, mas numa
// unica query (LEFT JOIN em permissoes_modulo) -- usada só por
// getServicosAuthContext para economizar 1 round-trip de rede por invocacao
// (medido em ~350ms em producao, ver plano de otimizacao de performance).
// Mantem as duas funcoes separadas acima intactas/exportadas, caso algo mais
// venha a precisar delas isoladamente.
async function getServicosAccessAndModuleRole(sql: SqlClient, collaboradorId: string, modulo: string) {
  const rows = await sql.unsafe(
    `
      select aus.*, pm.papel as _modulo_papel
      from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      left join ${SERVICOS_SCHEMA}.permissoes_modulo pm
        on pm.colaborador_id = aus.colaborador_id and pm.modulo = $3
      where aus.colaborador_id = $1
        and aus.ativo = true
        and s.slug = $2
        and s.ativo = true
      limit 1;
    `,
    [collaboradorId, SERVICOS_SYSTEM_SLUG, modulo],
  );

  const row = rows[0];
  if (!row) return { access: null as Record<string, unknown> | null, moduleRole: null as string | null };

  const { _modulo_papel, ...access } = row as Record<string, unknown> & { _modulo_papel: string | null };
  const accessLevel = getAccessLevel(access);

  let moduleRole: string | null;
  if (accessLevel === 'admin') {
    moduleRole = 'admin';
  } else if (!accessLevel) {
    moduleRole = null;
  } else {
    moduleRole = _modulo_papel || (modulo === 'oficina' ? 'nenhum' : 'usuario');
  }

  return { access, moduleRole };
}

export type ServicosAuthContext = {
  user: { id: string; email?: string };
  collaborator: Record<string, unknown> | null;
  access: Record<string, unknown> | null;
  moduleRole: string | null;
};

// Mesmo raciocinio do cache em servicos-api: o mesmo usuario costuma disparar
// varias chamadas em sequencia rapida (ex. abrir uma tela que busca varios
// catalogos), entao cacheamos por token+modulo por um TTL curto.
const AUTH_CONTEXT_TTL_MS = 30 * 1000;
const authContextCache = new Map<string, { expiresAt: number; context: ServicosAuthContext }>();

export async function getServicosAuthContext(
  request: Request,
  sql: SqlClient,
  supabaseUrl: string | undefined,
  supabaseAnonKey: string | undefined,
  modulo: string,
): Promise<ServicosAuthContext> {
  const token = getBearerToken(request);
  if (!token) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  const cacheKey = `${modulo}:${token}`;
  const cached = authContextCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.context;
  }

  // auth.getUser() (chamada de rede pra API de Auth do Supabase) e a conexao
  // inicial do postgres.js (custo fixo alto medido em producao, ~1,3s, ver
  // plano de otimizacao de performance) sao independentes uma da outra --
  // dispara as duas em paralelo em vez de esperar a auth terminar pra so
  // depois abrir a conexao. `select 1` so serve pra forcar a conexao lazy do
  // postgres.js a abrir agora; getCurrentCollaborator reaproveita a mesma
  // conexao ja aberta na sequencia.
  const [user] = await Promise.all([
    getAuthenticatedUser(token, supabaseUrl, supabaseAnonKey),
    sql.unsafe('select 1;'),
  ]);
  const collaborator = await getCurrentCollaborator(sql, user);
  const { access, moduleRole } = collaborator?.id
    ? await getServicosAccessAndModuleRole(sql, String(collaborator.id), modulo)
    : { access: null, moduleRole: null };

  const context: ServicosAuthContext = { user, collaborator, access, moduleRole };
  authContextCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS, context });
  return context;
}
