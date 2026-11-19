// Leitura de credenciais do schema `integracoes` (config nao sensivel + segredos do Vault,
// resolvidos via integracoes.get_credenciais). Compartilhado por qualquer Edge Function que
// precise consumir uma integracao cadastrada na tela do Console (apps/admin).

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export interface IntegracaoCredenciaisContext {
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
}

// Cliente reutilizado entre invocacoes (isolate fica "warm" entre requests) -- evita handshake
// novo a cada chamada. Chaveado por url+key por seguranca, mas na pratica e' sempre o mesmo par
// (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY do ambiente da function).
const clientCache = new Map<string, SupabaseClient>();

function getClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  const key = `${supabaseUrl}|${serviceRoleKey}`;
  let client = clientCache.get(key);
  if (!client) {
    client = createClient(supabaseUrl, serviceRoleKey);
    clientCache.set(key, client);
  }
  return client;
}

// Credenciais mudam raramente (so' quando alguem edita a integracao em
// IntegrationsOverview.jsx) mas eram buscadas via round-trip HTTP/PostgREST em toda mensagem
// (webhook e envio) -- cache em memoria com TTL curto elimina esse round-trip no caminho comum.
// TTL de 30s e' baixo o suficiente pra nao exigir invalidacao manual ao salvar a integracao.
const CREDENCIAIS_CACHE_TTL_MS = 30_000;
const credenciaisCache = new Map<string, { valor: Record<string, unknown> | null; expiraEm: number }>();

export async function loadIntegracaoCredenciais(
  chave: string,
  ctx: IntegracaoCredenciaisContext,
): Promise<Record<string, unknown> | null> {
  if (!ctx.supabaseUrl || !ctx.serviceRoleKey) return null;

  const cacheKey = `${ctx.supabaseUrl}|${chave}`;
  const cached = credenciaisCache.get(cacheKey);
  if (cached && cached.expiraEm > Date.now()) return cached.valor;

  try {
    const client = getClient(ctx.supabaseUrl, ctx.serviceRoleKey);
    const { data, error } = await client.schema('integracoes').rpc('get_credenciais', { p_chave: chave });
    if (error) {
      console.error(`Falha ao carregar credenciais da integracao "${chave}": ${error.message}`);
      return null;
    }
    const valor = (data as Record<string, unknown> | null) || null;
    credenciaisCache.set(cacheKey, { valor, expiraEm: Date.now() + CREDENCIAIS_CACHE_TTL_MS });
    return valor;
  } catch (error) {
    console.error(`Erro ao carregar credenciais da integracao "${chave}":`, error);
    return null;
  }
}
