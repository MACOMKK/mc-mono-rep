import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { monitorCall } from './callMonitor';

function toApiError(message, status = 500, code) {
  const error = new Error(message || 'Falha ao consultar auditoria da plataforma.');
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
      result?.error || result?.message || result?.details || 'Falha ao consultar auditoria da plataforma.',
      response.status,
      result?.code || (response.status === 401 ? 'auth_required' : undefined),
    );
  }

  return result;
}

export const platformAuditApi = {
  logs: {
    create: async (payload = {}) => {
      const result = await invokePlataformaApi('create', {
        entity: 'logs_auditoria',
        payload,
      });

      return result.row || null;
    },
    list: async (options = {}) => {
      const result = await invokePlataformaApi('list', {
        entity: 'logs_auditoria',
        filters: options.filters || {},
        limit: options.limit,
        offset: options.offset,
      });

      return {
        rows: result.rows || [],
        total: result.total ?? (result.rows || []).length,
        limit: result.limit ?? options.limit ?? null,
        offset: result.offset ?? options.offset ?? 0,
      };
    },
  },
  accessLogs: {
    list: async (options = {}) => {
      const result = await invokePlataformaApi('list', {
        entity: 'logs_acesso',
        filters: options.filters || {},
        limit: options.limit,
        offset: options.offset,
      });

      return {
        rows: result.rows || [],
        total: result.total ?? (result.rows || []).length,
        limit: result.limit ?? options.limit ?? null,
        offset: result.offset ?? options.offset ?? 0,
      };
    },
  },
};
