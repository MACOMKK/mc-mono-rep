import { assertSupabaseConfigured, supabase } from '@macom/api-client/supabaseClient';

// Client do sino generico (notificacoes in-app) -- qualquer app do monorepo usa passando o slug
// do proprio sistema (mesmo `sistema` de public.sistemas). Backend correspondente: Edge Function
// `notificacoes-api` (leitura/marcar como lida) + supabase/functions/_shared/notificacoes.ts
// (`notificar()`, chamado pela -api de cada app pra gravar). Web Push e outro pacote (@macom/push).

function toError(message, status) {
  const error = new Error(typeof message === 'string' ? message : message?.message || 'Falha ao carregar notificacoes.');
  if (status) error.status = status;
  return error;
}

async function invokeNotificacoesApi(body) {
  assertSupabaseConfigured();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw toError('Sessao expirada. Faca login novamente.', 401);

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notificacoes-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw toError(result?.error, response.status);
  return result.data;
}

export function listNotificacoes({ sistema, limit = 20 }) {
  return invokeNotificacoesApi({ action: 'list', sistema, limit });
}

export function markNotificacaoRead({ sistema, id }) {
  return invokeNotificacoesApi({ action: 'mark_read', sistema, id });
}

export function markAllNotificacoesRead({ sistema }) {
  return invokeNotificacoesApi({ action: 'mark_all_read', sistema });
}
