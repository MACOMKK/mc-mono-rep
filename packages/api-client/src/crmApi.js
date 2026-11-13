import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { monitorCall } from './callMonitor';

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

// Regiao opcional de execucao da Edge Function (ex.: us-west-2, onde fica o banco). Sem a
// variavel, o Supabase escolhe a regiao mais proxima do usuario (sa-east-1), que fica a ~200 ms
// de ida e volta do banco a cada query. `forceFunctionRegion` na URL (em vez do header
// x-region) evita preflight/CORS extra. Atencao: com regiao explicita NAO ha fallback
// automatico se a regiao cair -- para voltar ao padrao, basta remover a variavel e refazer o
// deploy do app. Ver docs: supabase.com/docs/guides/functions/regional-invocation
const CRM_API_REGION = String(import.meta.env.VITE_CRM_API_REGION || '').trim();
const CRM_API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api${
  CRM_API_REGION ? `?forceFunctionRegion=${encodeURIComponent(CRM_API_REGION)}` : ''
}`;

// Tempo/status de cada chamada vao para o monitor compartilhado (callMonitor.js):
// no console do navegador, `macomApiLog()` / `macomApiLog.problemas()`.
function invokeCrm(body = {}, accessTokenOverride) {
  return monitorCall('crm-api', body, () => invokeCrmRaw(body, accessTokenOverride));
}

async function invokeCrmRaw(body = {}, accessTokenOverride) {
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
    response = await fetch(CRM_API_URL, {
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
        // omitido (undefined) => backend usa o default (true); so vira 'false' quando o
        // chamador pedir explicitamente (Kanban, que busca o funil inteiro sem paginacao).
        count: options.count === false ? false : undefined,
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
  dashboard: {
    async metricas({ filters } = {}) {
      const result = await invokeCrm({ action: 'dashboard_metricas', filters });
      return {
        clientesTotal: result.clientesTotal || 0,
        leadsTotal: result.leadsTotal || 0,
        leadsConvertidos: result.leadsConvertidos || 0,
        atividadesTotal: result.atividadesTotal || 0,
        statusCounts: result.statusCounts || {},
        origemCounts: result.origemCounts || {},
      };
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
  fila_atendimento: {
    async getConfig() {
      return invokeCrm({ action: 'get_fila_atendimento_config' });
    },
    async saveConfig(payload) {
      return invokeCrm({ action: 'save_fila_atendimento_config', ...payload });
    },
  },
  clientes: {
    ...buildEntity('clientes'),
    async buscar(busca) {
      const result = await invokeCrm({ action: 'cliente_buscar', busca });
      return result?.rows || [];
    },
    async adicionarContato({ clienteId, telefone, tipo }) {
      const result = await invokeCrm({
        action: 'cliente_contato_adicionar',
        cliente_id: clienteId,
        telefone,
        tipo,
      });
      return result.row || null;
    },
    async removerContato(id) {
      await invokeCrm({ action: 'cliente_contato_remover', id });
      return { id };
    },
    async getResumoVendas(clienteId) {
      return invokeCrm({ action: 'get_cliente_resumo_vendas', cliente_id: clienteId });
    },
  },
  avaliacoes_cliente: buildEntity('avaliacoes_cliente'),
  leads: {
    ...buildEntity('leads'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_lead_full', ...payload });
    },
    async excluirTeste(id) {
      return invokeCrm({ action: 'lead_excluir_teste', id });
    },
    async listCatalogos() {
      const result = await invokeCrm({ action: 'list_catalogos_leads' });
      return {
        pipelines: result.pipelines || [],
        etapasPipeline: result.etapasPipeline || [],
        pipelineAutomacoes: result.pipelineAutomacoes || [],
        origensLead: result.origensLead || [],
        motivosStatus: result.motivosStatus || [],
        responsaveis: result.responsaveis || [],
      };
    },
  },
  atendimentos: {
    ...buildEntity('atendimentos'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_evento_full', ...payload });
    },
    async listContadores({ filters, search } = {}) {
      const result = await invokeCrm({ action: 'list_atividades_contadores', filters, search });
      return {
        statusCounts: result.statusCounts || {},
        agendaCounts: result.agendaCounts || { atrasados: 0, hoje: 0, futuros: 0 },
      };
    },
  },
  historico_atendimentos: buildEntity('historico_atendimentos'),
  veiculos_interesse: buildEntity('veiculos_interesse'),
  categorias_veiculo: buildEntity('categorias_veiculo'),
  origens_lead: buildEntity('origens_lead'),
  marcas_veiculo: buildEntity('marcas_veiculo'),
  modelos_veiculo: buildEntity('modelos_veiculo'),
  versoes_veiculo: buildEntity('versoes_veiculo'),
  cores_veiculo: buildEntity('cores_veiculo'),
  veiculos_estoque: {
    ...buildEntity('veiculos_estoque'),
    async saveFull(payload) {
      return invokeCrm({ action: 'save_veiculo_estoque_full', ...payload });
    },
    async reserva(payload) {
      return invokeCrm({ action: 'veiculo_estoque_reserva', ...payload });
    },
  },
  veiculos_estoque_historico_reserva: buildEntity('veiculos_estoque_historico_reserva'),
  pipelines: buildEntity('pipelines'),
  etapas_pipeline: buildEntity('etapas_pipeline'),
  pipeline_automacoes: buildEntity('pipeline_automacoes'),
  motivos_status: buildEntity('motivos_status'),
  propostas: {
    ...buildEntity('propostas'),
    async acceptProposta(payload) {
      return invokeCrm({ action: 'accept_proposta', ...payload });
    },
    async excluirTeste(id) {
      return invokeCrm({ action: 'proposta_excluir_teste', id });
    },
  },
  vendas: {
    ...buildEntity('vendas'),
    async closeVenda(payload) {
      return invokeCrm({ action: 'close_venda', ...payload });
    },
    async cancelVenda(payload) {
      return invokeCrm({ action: 'cancel_venda', ...payload });
    },
  },
  conversas_atendimento: {
    ...buildEntity('conversas_atendimento'),
    async sendMensagem(payload) {
      const result = await invokeCrm({ action: 'send_atendimento_mensagem', ...payload });
      return result.row || null;
    },
    async transferir(payload) {
      const result = await invokeCrm({ action: 'transferir_atendimento', ...payload });
      return result.row || null;
    },
    async listTemplatesWhatsapp() {
      const result = await invokeCrm({ action: 'list_whatsapp_templates' });
      return result.rows || [];
    },
    // payload: { telefone } | { leadId } | { clienteId } -- cria ou reabre a conversa do numero.
    async iniciar(payload) {
      const result = await invokeCrm({ action: 'iniciar_conversa_atendimento', ...payload });
      return { row: result.row || null, created: Boolean(result.created) };
    },
  },
  mensagens_atendimento: buildEntity('mensagens_atendimento'),
  notas_conversa: buildEntity('notas_conversa'),
};
