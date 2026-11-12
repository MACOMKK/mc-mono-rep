import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { monitorCall } from './callMonitor';

function toApiError(message, status = 500, code) {
  const error = new Error(message || 'Falha ao consultar integracoes da plataforma.');
  error.status = status;
  if (code) error.code = code;
  return error;
}

function invokePlataformaApi(action, payload = {}) {
  return monitorCall('plataforma-api', { action, entity: payload?.entity }, () => invokePlataformaApiRaw(action, payload));
}

async function invokePlataformaApiRaw(action, payload = {}) {
  assertSupabaseConfigured();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toApiError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plataforma-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...payload }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw toApiError(
      result?.error || result?.message || result?.details || 'Falha ao consultar integracoes da plataforma.',
      response.status,
      result?.code || (response.status === 401 ? 'auth_required' : undefined),
    );
  }

  return result;
}

// `secrets` no payload de `save` so aceita valores novos a definir (string nao vazia) --
// campos omitidos/vazios mantem o segredo ja configurado (o backend nunca devolve o
// valor decifrado, so o nome do campo + quando foi atualizado, em `row.secrets`).
export const platformIntegrationsApi = {
  list: async () => {
    const result = await invokePlataformaApi('list_integracoes');
    return result.rows || [];
  },
  save: async (payload = {}) => {
    return invokePlataformaApi('save_integracao', { payload });
  },
};
