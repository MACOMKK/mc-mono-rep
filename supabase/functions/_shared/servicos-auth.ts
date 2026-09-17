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

  const user = await getAuthenticatedUser(token, supabaseUrl, supabaseAnonKey);
  const collaborator = await getCurrentCollaborator(sql, user);
  const access = collaborator?.id ? await getServicosAccess(sql, String(collaborator.id)) : null;
  const moduleRole = collaborator?.id
    ? await getServicosModuleRole(sql, String(collaborator.id), access, modulo)
    : null;

  const context: ServicosAuthContext = { user, collaborator, access, moduleRole };
  authContextCache.set(cacheKey, { expiresAt: Date.now() + AUTH_CONTEXT_TTL_MS, context });
  return context;
}
