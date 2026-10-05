import { assertSupabaseConfigured, supabase } from './supabaseClient';

function toError(message, status = 500, code, details, hint) {
  const normalizedMessage =
    typeof message === 'string'
      ? message
      : message?.message || 'Falha ao consultar o modulo oficina.';

  const error = new Error(normalizedMessage);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  if (hint) error.hint = hint;
  return error;
}

const DEFAULT_TIMEOUT_MS = 20000;

// Combina um AbortSignal externo (ex.: vindo do React Query, cancelado quando a
// query fica obsoleta) com um timeout interno -- aborta se qualquer um dos dois
// disparar primeiro. Sem lib externa: AbortSignal.any() ainda nao tem suporte
// garantido no target do projeto.
function createRequestSignal(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Tempo de conexao esgotado.', 'TimeoutError'));
  }, timeoutMs);

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort(externalSignal.reason);
    else externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
  }

  return { signal: controller.signal, cancel: () => clearTimeout(timeoutId) };
}

async function fetchComTimeout(url, options, externalSignal, timeoutMs) {
  const { signal, cancel } = createRequestSignal(externalSignal, timeoutMs);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    // Cancelamento intencional (ex.: React Query descartou uma busca obsoleta) --
    // propaga como abort puro, sem mensagem de erro pro usuario.
    if (externalSignal?.aborted) throw error;
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      throw toError('Tempo de conexao esgotado. Verifique sua internet e tente novamente.', 0, 'timeout');
    }
    throw error;
  } finally {
    cancel();
  }
}

// Chama a edge function servicos-oficina-api -- separada de servicos-api
// (Financeiro) de proposito, ver apps/servicos/CLAUDE.md.
async function invokeOficina(body = {}, accessTokenOverride, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetchComTimeout(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/servicos-oficina-api`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    },
    signal,
    timeoutMs,
  );

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

// Variante pra rota publica (link de checklist compartilhado via WhatsApp):
// o visitante nao tem sessao Supabase, entao autentica no gateway so com a
// anon key -- a autorizacao de verdade e o token assinado que vai no body,
// validado dentro da propria action checklist_publico_obter.
async function invokeOficinaPublico(body = {}, { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assertSupabaseConfigured();

  const response = await fetchComTimeout(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/servicos-oficina-api`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    },
    signal,
    timeoutMs,
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const payloadError = result?.error;
    throw toError(payloadError, response.status, payloadError?.code || result?.code, payloadError?.details, payloadError?.hint);
  }

  return result;
}

export const oficinaApi = {
  auth: {
    async me(accessToken) {
      const result = await invokeOficina({ action: 'me' }, accessToken);
      return { role: result.role || null, collaboratorId: result.collaborator_id || null };
    },
  },
  storage: {
    bucket: 'oficina-checklist-fotos',
  },
  checklists: {
    async list({ status, colaboradorId, unidadeId, busca, limit, offset, incluirFotos } = {}) {
      const result = await invokeOficina({
        action: 'checklist_listar',
        status,
        colaborador_id: colaboradorId,
        unidade_id: unidadeId,
        busca,
        limit,
        offset,
        incluir_fotos: incluirFotos,
      });
      return result.rows || [];
    },
    async obter(id) {
      const result = await invokeOficina({ action: 'checklist_obter', id });
      return {
        row: result.row || null,
        itens: result.itens || [],
        avarias: result.avarias || [],
        historico: result.historico || [],
      };
    },
    async iniciar({ veiculoId, clienteId, colaboradorId, unidadeId, os, km, ehTeste }) {
      const result = await invokeOficina({
        action: 'checklist_iniciar',
        veiculo_id: veiculoId,
        cliente_id: clienteId,
        colaborador_id: colaboradorId,
        unidade_id: unidadeId,
        os,
        km,
        ...(ehTeste ? { eh_teste: true } : {}),
      });
      return { row: result.row || null, avisoDonoDiferente: result.aviso_dono_diferente || null };
    },
    async excluir(id) {
      return invokeOficina({ action: 'checklist_excluir', id });
    },
    async atualizar(id, dados) {
      const result = await invokeOficina({ action: 'checklist_atualizar', id, ...dados });
      return result.row || null;
    },
    async concluirAvaliacao(id) {
      const result = await invokeOficina({ action: 'checklist_concluir_avaliacao', id });
      return result.row || null;
    },
    async finalizar(
      id,
      {
        entregaConferida,
        entregaObservacoes,
        assinaturaSaida,
        assinaturaSaidaNome,
        assinaturaSaidaVinculo,
        assinaturaSaidaDetalheVinculo,
      } = {},
    ) {
      const result = await invokeOficina({
        action: 'checklist_finalizar',
        id,
        entrega_conferida: entregaConferida,
        entrega_observacoes: entregaObservacoes,
        assinatura_saida: assinaturaSaida,
        assinatura_saida_nome: assinaturaSaidaNome,
        assinatura_saida_vinculo: assinaturaSaidaVinculo,
        assinatura_saida_detalhe_vinculo: assinaturaSaidaDetalheVinculo,
      });
      return result.row || null;
    },
    // Gera um token de compartilhamento (valido por 24h) pra montar o link
    // publico /checklist-publico/:id?token=... que pode ser mandado pro
    // cliente via WhatsApp -- sem gerar nem guardar nenhum PDF no servidor.
    async compartilharLink(id) {
      const result = await invokeOficina({ action: 'checklist_link_compartilhar', id });
      return { token: result.token, expiresAt: result.expires_at };
    },
    publico: {
      async obter({ id, token }) {
        const result = await invokeOficinaPublico({ action: 'checklist_publico_obter', id, token });
        return { row: result.row || null, itens: result.itens || [], avarias: result.avarias || [] };
      },
    },
  },
  itens: {
    async upsert(avaliacaoId, categoria, itens) {
      const result = await invokeOficina({ action: 'checklist_itens_upsert', avaliacao_id: avaliacaoId, categoria, itens });
      return result.rows || [];
    },
  },
  avarias: {
    async adicionar(avaliacaoId, { tipo, posX, posY, area, observacao }) {
      const result = await invokeOficina({
        action: 'checklist_avaria_adicionar',
        avaliacao_id: avaliacaoId,
        tipo,
        pos_x: posX,
        pos_y: posY,
        area,
        observacao,
      });
      return result.row || null;
    },
    async remover(id) {
      return invokeOficina({ action: 'checklist_avaria_remover', id });
    },
  },
  fotos: {
    async registrar(avaliacaoId, { storagePath, categoria, legenda, avariaId }) {
      const result = await invokeOficina({
        action: 'checklist_foto_registrar',
        avaliacao_id: avaliacaoId,
        storage_path: storagePath,
        categoria,
        legenda,
        avaria_id: avariaId,
      });
      return { row: result.row || null, url: result.url || null };
    },
    async remover(avaliacaoId, storagePath) {
      const result = await invokeOficina({
        action: 'checklist_foto_remover',
        avaliacao_id: avaliacaoId,
        storage_path: storagePath,
      });
      return result.row || null;
    },
    async atualizar(avaliacaoId, { storagePath, categoria, legenda }) {
      const result = await invokeOficina({
        action: 'checklist_foto_atualizar',
        avaliacao_id: avaliacaoId,
        storage_path: storagePath,
        categoria,
        legenda,
      });
      return result.row || null;
    },
  },
  clientes: {
    async buscar(busca, { signal } = {}) {
      const result = await invokeOficina({ action: 'cliente_buscar', busca }, undefined, { signal });
      return result.rows || [];
    },
    async criar({ nome, telefone, email, cpfCnpj }) {
      const result = await invokeOficina({ action: 'cliente_criar', nome, telefone, email, cpf_cnpj: cpfCnpj });
      return result.row || null;
    },
    async listar(busca) {
      const result = await invokeOficina({ action: 'cliente_listar', busca });
      return result.rows || [];
    },
    async obter(clienteId) {
      return invokeOficina({ action: 'cliente_obter', id: clienteId });
    },
    async atualizar({ id, nome, telefone, email, cpfCnpj }) {
      const result = await invokeOficina({ action: 'cliente_atualizar', id, nome, telefone, email, cpf_cnpj: cpfCnpj });
      return result.row || null;
    },
    async excluir(clienteId) {
      return invokeOficina({ action: 'cliente_excluir', id: clienteId });
    },
  },
  veiculos: {
    async buscar(busca, { signal } = {}) {
      const result = await invokeOficina({ action: 'veiculo_buscar', busca }, undefined, { signal });
      return result.rows || [];
    },
    async listar(busca) {
      const result = await invokeOficina({ action: 'veiculo_listar', busca });
      return result.rows || [];
    },
    async criar({ modeloId, versaoId, chassi, placa, corId, km }) {
      const result = await invokeOficina({
        action: 'veiculo_criar',
        modelo_id: modeloId,
        versao_id: versaoId,
        chassi,
        placa,
        cor_id: corId,
        km,
      });
      return result.row || null;
    },
    async atualizar({ id, modeloId, versaoId, chassi, placa, corId, km }) {
      const result = await invokeOficina({
        action: 'veiculo_atualizar',
        id,
        modelo_id: modeloId,
        versao_id: versaoId,
        chassi,
        placa,
        cor_id: corId,
        km,
      });
      return result.row || null;
    },
    async obter(veiculoId) {
      const result = await invokeOficina({ action: 'veiculo_obter', id: veiculoId });
      return result;
    },
    async transferir({ veiculoId, clienteId }) {
      const result = await invokeOficina({ action: 'veiculo_transferir', veiculo_id: veiculoId, cliente_id: clienteId });
      return result.row || null;
    },
    async promoverEstoque({ veiculoId, condicao, preco, observacoes }) {
      const result = await invokeOficina({
        action: 'veiculo_promover_estoque',
        veiculo_id: veiculoId,
        condicao,
        preco,
        observacoes,
      });
      return result.row || null;
    },
    async excluir(veiculoId) {
      return invokeOficina({ action: 'veiculo_excluir', veiculo_id: veiculoId });
    },
  },
  cores: {
    async listar() {
      const result = await invokeOficina({ action: 'cores_listar' });
      return result.rows || [];
    },
    async criar(nome) {
      const result = await invokeOficina({ action: 'cores_criar', nome });
      return result.row || null;
    },
  },
  unidades: {
    async listar() {
      const result = await invokeOficina({ action: 'unidades_listar' });
      return result.rows || [];
    },
  },
};
