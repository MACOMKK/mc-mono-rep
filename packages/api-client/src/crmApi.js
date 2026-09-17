import { assertSupabaseConfigured, supabase } from './supabaseClient';

function toError(message, status = 500, code, details, hint) {
  const normalizedMessage =
    typeof message === 'string'
      ? message
      : message?.message || 'Falha ao consultar o CRM.';

  const error = new Error(normalizedMessage);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  if (hint) error.hint = hint;
  return error;
}

const CRM_API_TIMEOUT_MS = 20000;

async function invokeCrm(body = {}, accessTokenOverride) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CRM_API_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw toError('A requisicao demorou demais. Tente novamente.', 504, 'timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const payloadError = result?.error;
    throw toError(
      payloadError,
      response.status,
      payloadError?.code || result?.code,
      payloadError?.details,
      payloadError?.hint,
    );
  }

  return result;
}

function buildEntity(entity) {
  return {
    async list(options = {}) {
      const result = await invokeCrm({
        action: 'list',
        entity,
        filters: options.filters || {},
        or: options.or,
        search: options.search,
        orderBy: options.orderBy,
        ascending: options.ascending,
        limit: options.limit,
        offset: options.offset,
        page: options.page,
      });
      return result.rows || [];
    },

    async listPage(options = {}) {
      const result = await invokeCrm({
        action: 'list',
        entity,
        filters: options.filters || {},
        or: options.or,
        search: options.search,
        orderBy: options.orderBy,
        ascending: options.ascending,
        limit: options.limit,
        offset: options.offset,
        page: options.page,
      });

      return {
        rows: result.rows || [],
        count: result.count || 0,
        page: result.page || options.page || 1,
        pageSize: result.pageSize || options.limit || 100,
        offset: result.offset || options.offset || 0,
      };
    },

    async getById(id) {
      const result = await invokeCrm({
        action: 'get',
        entity,
        id,
      });
      return result.row || null;
    },

    async create(payload) {
      const result = await invokeCrm({
        action: 'create',
        entity,
        payload,
      });
      return result.row || null;
    },

    async update(id, payload) {
      const result = await invokeCrm({
        action: 'update',
        entity,
        id,
        payload,
      });
      return result.row || null;
    },

    async remove(id) {
      await invokeCrm({
        action: 'delete',
        entity,
        id,
      });
      return { id };
    },
  };
}

export const crmApi = {
  auth: {
    async me(accessToken) {
      const result = await invokeCrm({ action: 'me' }, accessToken);
      return {
        row: result.row || null,
        access: result.access || null,
        mustChangePassword: Boolean(result.must_change_password),
      };
    },
    async clearPasswordChangeRequired() {
      return invokeCrm({ action: 'clear_password_change_required' });
    },
  },
  responsaveis: {
    async list() {
      const result = await invokeCrm({ action: 'list_responsaveis' });
      return result.rows || [];
    },
  },
  distribuicao: {
    async getConfig() {
      return invokeCrm({ action: 'get_distribution_config' });
    },
    async saveConfig(payload) {
      return invokeCrm({ action: 'save_distribution_config', ...payload });
    },
    async clearTestData() {
      return invokeCrm({ action: 'clear_crm_test_data', confirm: 'LIMPAR-DADOS-CRM', confirmar_global: true });
    },
  },
  clientes: buildEntity('clientes'),
  leads: {
    ...buildEntity('leads'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_lead_full', ...payload });
    },
  },
  atendimentos: {
    ...buildEntity('atendimentos'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_evento_full', ...payload });
    },
  },
  historico_atendimentos: buildEntity('historico_atendimentos'),
  veiculos_interesse: buildEntity('veiculos_interesse'),
  categorias_veiculo: buildEntity('categorias_veiculo'),
  origens_lead: buildEntity('origens_lead'),
  marcas_veiculo: buildEntity('marcas_veiculo'),
  modelos_veiculo: buildEntity('modelos_veiculo'),
  versoes_veiculo: buildEntity('versoes_veiculo'),
  veiculos_estoque: {
    ...buildEntity('veiculos_estoque'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_veiculo_estoque_full', ...payload });
    },
  },
  pipelines: buildEntity('pipelines'),
  etapas_pipeline: buildEntity('etapas_pipeline'),
  motivos_status: buildEntity('motivos_status'),
  propostas: {
    ...buildEntity('propostas'),
    async acceptProposta(payload) {
      return invokeCrm({ action: 'accept_proposta', ...payload });
    },
  },
  vendas: {
    ...buildEntity('vendas'),
    async closeVenda(payload) {
      return invokeCrm({ action: 'close_venda', ...payload });
    },
  },
};
