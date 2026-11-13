// Timeout das chamadas as Edge Functions. Sem ele, uma requisicao presa no servidor deixa a tela
// "carregando" ate a Edge Function morrer no limite (~150 s) -- visto em 2026-11-13 (listas que so
// apareciam com F5; causa no servidor documentada em supabase/functions/_shared/db.ts). Com timeout,
// a tela mostra erro e o React Query pode tentar de novo.
//
// 30 s: acima do maior tempo legitimo medido (servicos-api, ~18 s) e bem abaixo dos ~150 s de uma
// requisicao presa. crmApi tem o proprio timeout (20 s).
export const EDGE_FUNCTION_TIMEOUT_MS = 30000;

// Combina um AbortSignal externo (ex.: vindo do React Query, cancelado quando a query fica obsoleta)
// com o timeout -- aborta no que disparar primeiro. Sem AbortSignal.any(): ainda nao tem suporte
// garantido no target do projeto.
export async function fetchWithTimeout(
  url,
  options = {},
  {
    signal: externalSignal,
    timeoutMs = EDGE_FUNCTION_TIMEOUT_MS,
    timeoutMessage = 'A requisicao demorou demais. Tente novamente.',
    timeoutStatus = 504,
  } = {},
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Tempo de conexao esgotado.', 'TimeoutError'));
  }, timeoutMs);
  const onExternalAbort = () => controller.abort(externalSignal.reason);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    // Cancelamento intencional (ex.: React Query descartou uma busca obsoleta) -- propaga como abort
    // puro, sem mensagem de erro pro usuario.
    if (externalSignal?.aborted) throw error;
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      const timeoutError = new Error(timeoutMessage);
      timeoutError.status = timeoutStatus;
      timeoutError.code = 'timeout'; // callMonitor classifica por este code
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}
