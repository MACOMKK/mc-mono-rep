// Leitura de credenciais do schema `integracoes` (config nao sensivel + segredos do Vault,
// resolvidos via integracoes.get_credenciais). Compartilhado por qualquer Edge Function que
// precise consumir uma integracao cadastrada na tela do Console (apps/admin).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export interface IntegracaoCredenciaisContext {
  supabaseUrl?: string | null;
  serviceRoleKey?: string | null;
}

export async function loadIntegracaoCredenciais(
  chave: string,
  ctx: IntegracaoCredenciaisContext,
): Promise<Record<string, unknown> | null> {
  if (!ctx.supabaseUrl || !ctx.serviceRoleKey) return null;

  try {
    const client = createClient(ctx.supabaseUrl, ctx.serviceRoleKey);
    const { data, error } = await client.schema('integracoes').rpc('get_credenciais', { p_chave: chave });
    if (error) {
      console.error(`Falha ao carregar credenciais da integracao "${chave}": ${error.message}`);
      return null;
    }
    return (data as Record<string, unknown> | null) || null;
  } catch (error) {
    console.error(`Erro ao carregar credenciais da integracao "${chave}":`, error);
    return null;
  }
}
