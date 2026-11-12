import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { monitorCall } from './callMonitor';
import { platformAuditApi } from './platformAuditApi';

function toApiError(message, status = 500, code) {
  const error = new Error(message || 'Falha ao consultar permissoes da plataforma.');
  error.status = status;
  if (code) error.code = code;
  return error;
}

function invokeSupabaseFunction(functionName, action, payload = {}, accessTokenOverride) {
  return monitorCall(functionName, { action, entity: payload?.entity }, () => invokeSupabaseFunctionRaw(functionName, action, payload, accessTokenOverride));
}

async function invokeSupabaseFunctionRaw(functionName, action, payload = {}, accessTokenOverride) {
  assertSupabaseConfigured();
  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toApiError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
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
      result?.error || result?.message || result?.details || 'Falha ao consultar permissoes da plataforma.',
      response.status,
      result?.code || (response.status === 401 ? 'auth_required' : undefined),
    );
  }

  return result;
}

const invokePlataformaApi = (action, payload = {}, accessTokenOverride) =>
  invokeSupabaseFunction('plataforma-api', action, payload, accessTokenOverride);

async function writeConsoleAudit(payload) {
  try {
    await platformAuditApi.logs.create(payload);
  } catch (error) {
    console.warn('Falha ao registrar auditoria do Console.', error);
  }
}

export const platformPermissionsApi = {
  central: {
    list: async (options = {}) => {
      const result = await invokePlataformaApi('list', {
        entity: 'permissoes_central',
        filters: options.filters || {},
      });
      return result.rows || [];
    },
    save: async (payload) => {
      const result = await invokePlataformaApi('save', {
        entity: 'permissoes_central',
        payload,
      });
      await writeConsoleAudit({
        entidade: 'permissoes_sistemas',
        acao: 'atualizar',
        registro_id: result.row?.id || payload.id || null,
        antes: null,
        depois: result.row || null,
        metadados: {
          sistema_slug: 'central',
          modulo: result.row?.modulo || payload.modulo || null,
          funcao: result.row?.funcao || payload.funcao || null,
          nivel_acesso_novo: result.row?.nivel_acesso || payload.nivel_acesso || null,
        },
      });
      return result.row || null;
    },
  },
  centralNivel: {
    list: async (options = {}, accessTokenOverride) => {
      const result = await invokePlataformaApi(
        'list',
        {
          entity: 'permissoes_central_nivel',
          filters: options.filters || {},
        },
        accessTokenOverride,
      );
      return result.rows || [];
    },
    save: async (payload) => {
      const result = await invokePlataformaApi('save', {
        entity: 'permissoes_central_nivel',
        payload,
      });
      await writeConsoleAudit({
        entidade: 'permissoes_sistemas',
        acao: 'atualizar',
        registro_id: result.row?.id || payload.id || null,
        antes: null,
        depois: result.row || null,
        metadados: {
          sistema_slug: 'central',
          modulo: result.row?.modulo || payload.modulo || null,
          permissao: result.row?.permissao || payload.permissao || null,
          nivel_acesso_novo: result.row?.nivel_acesso || payload.nivel_acesso || null,
        },
      });
      return result.row || null;
    },
  },
  relatorios: {
    list: async (options = {}, accessTokenOverride) => {
      const result = await invokePlataformaApi(
        'list',
        {
          entity: 'permissoes_funcoes_relatorios',
          filters: options.filters || {},
        },
        accessTokenOverride,
      );
      return result.rows || [];
    },
    save: async (payload) => {
      const result = await invokePlataformaApi('save', {
        entity: 'permissoes_funcoes_relatorios',
        payload,
      });
      await writeConsoleAudit({
        entidade: 'permissoes_sistemas',
        acao: 'atualizar',
        registro_id: result.row?.id || payload.id || null,
        antes: null,
        depois: result.row || null,
        metadados: {
          sistema_slug: 'relatorios',
          modulo: result.row?.modulo || payload.modulo || null,
          permissao: result.row?.permissao || payload.permissao || null,
          nivel_acesso_novo: result.row?.nivel_acesso || payload.nivel_acesso || null,
        },
      });
      return result.row || null;
    },
  },
};
