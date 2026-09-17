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

// Chama a edge function servicos-oficina-api -- separada de servicos-api
// (Financeiro) de proposito, ver apps/servicos/CLAUDE.md.
async function invokeOficina(body = {}, accessTokenOverride) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/servicos-oficina-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

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
    async list({ status, colaboradorId, busca, limit, offset } = {}) {
      const result = await invokeOficina({
        action: 'checklist_listar',
        status,
        colaborador_id: colaboradorId,
        busca,
        limit,
        offset,
      });
      return result.rows || [];
    },
    async obter(id) {
      const result = await invokeOficina({ action: 'checklist_obter', id });
      return { row: result.row || null, itens: result.itens || [], avarias: result.avarias || [] };
    },
    async iniciar({ veiculoId, clienteId, colaboradorId, os, km }) {
      const result = await invokeOficina({
        action: 'checklist_iniciar',
        veiculo_id: veiculoId,
        cliente_id: clienteId,
        colaborador_id: colaboradorId,
        os,
        km,
      });
      return result.row || null;
    },
    async atualizar(id, dados) {
      const result = await invokeOficina({ action: 'checklist_atualizar', id, ...dados });
      return result.row || null;
    },
    async finalizar(id, { entregaConferida, entregaObservacoes, assinaturaCliente } = {}) {
      const result = await invokeOficina({
        action: 'checklist_finalizar',
        id,
        entrega_conferida: entregaConferida,
        entrega_observacoes: entregaObservacoes,
        assinatura_cliente: assinaturaCliente,
      });
      return result.row || null;
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
    async registrar(avaliacaoId, { storagePath, categoria, legenda }) {
      const result = await invokeOficina({
        action: 'checklist_foto_registrar',
        avaliacao_id: avaliacaoId,
        storage_path: storagePath,
        categoria,
        legenda,
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
  },
  clientes: {
    async buscar(busca) {
      const result = await invokeOficina({ action: 'cliente_buscar', busca });
      return result.rows || [];
    },
    async criar({ nome, telefone, email, cpfCnpj }) {
      const result = await invokeOficina({ action: 'cliente_criar', nome, telefone, email, cpf_cnpj: cpfCnpj });
      return result.row || null;
    },
  },
  veiculos: {
    async buscar(busca) {
      const result = await invokeOficina({ action: 'veiculo_buscar', busca });
      return result.rows || [];
    },
    async criar({ modeloId, versaoId, chassi, placa, cor, km }) {
      const result = await invokeOficina({
        action: 'veiculo_criar',
        modelo_id: modeloId,
        versao_id: versaoId,
        chassi,
        placa,
        cor,
        km,
      });
      return result.row || null;
    },
  },
};
