import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { removerArquivoAssinatura, uploadAssinatura } from './signatureStorage';

function toError(message, status = 500, code, details, hint) {
  const normalizedMessage =
    typeof message === 'string'
      ? message
      : message?.message || 'Falha ao consultar o modulo financeiro.';

  const error = new Error(normalizedMessage);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  if (hint) error.hint = hint;
  return error;
}

async function invokeServicos(body = {}, accessTokenOverride) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/servicos-api`, {
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

export const financeiroApi = {
  auth: {
    async me(accessToken) {
      const result = await invokeServicos({ action: 'me' }, accessToken);
      return {
        row: result.row || null,
        access: result.access || null,
        role: result.role || null,
        mustChangePassword: Boolean(result.must_change_password),
        pode_reprovar_aprovada: Boolean(result.pode_reprovar_aprovada),
      };
    },
    async clearPasswordChangeRequired() {
      return invokeServicos({ action: 'clear_password_change_required' });
    },
  },
  storage: {
    bucket: 'comprovantes-pagamento',
  },
  empresas: {
    async list() {
      const result = await invokeServicos({ action: 'list_empresas' });
      return result.rows || [];
    },
  },
  departamentos: {
    async list() {
      const result = await invokeServicos({ action: 'list_departamentos' });
      return result.rows || [];
    },
  },
  fornecedores: {
    async list() {
      const result = await invokeServicos({ action: 'list_fornecedores' });
      return result.rows || [];
    },
    async listAdmin() {
      const result = await invokeServicos({ action: 'list_fornecedores_admin' });
      return result.rows || [];
    },
    async criar(dados) {
      const result = await invokeServicos({ action: 'criar_fornecedor', ...dados });
      return result.row || null;
    },
    async atualizar(id, dados) {
      const result = await invokeServicos({ action: 'atualizar_fornecedor', id, ...dados });
      return result.row || null;
    },
    async deletar(id) {
      await invokeServicos({ action: 'deletar_fornecedor', id });
    },
  },
  categorias: {
    async list() {
      const result = await invokeServicos({ action: 'list_categorias' });
      return result.rows || [];
    },
    async listAdmin() {
      const result = await invokeServicos({ action: 'list_categorias_admin' });
      return result.rows || [];
    },
    async criar(nome) {
      const result = await invokeServicos({ action: 'criar_categoria', nome });
      return result.row || null;
    },
    async atualizar(id, { nome, ativo }) {
      const result = await invokeServicos({ action: 'atualizar_categoria', id, nome, ativo });
      return result.row || null;
    },
    async deletar(id) {
      await invokeServicos({ action: 'deletar_categoria', id });
    },
  },
  aprovadores: {
    async list() {
      const result = await invokeServicos({ action: 'list_aprovadores' });
      return result.rows || [];
    },
  },
  colaboradores: {
    async getProfile(colaboradorId) {
      const result = await invokeServicos({ action: 'get_colaborador_profile', colaboradorId });
      return result.row || null;
    },
    // Upload em si e' generico (ver signatureStorage.js) -- so o registro em
    // colaboradores.assinatura_url/path que passa pela edge function (acao 'atualizar_assinatura'
    // em servicos-api), especifica desse app.
    uploadAssinatura,
    removerArquivoAssinatura,
    async atualizarAssinatura({ signatureUrl, signaturePath }) {
      const result = await invokeServicos({
        action: 'atualizar_assinatura',
        signature_url: signatureUrl,
        signature_path: signaturePath,
      });
      return { signatureUrl: result.signature_url || '', signaturePath: result.signature_path || '' };
    },
  },
  avisos: {
    async getAtivo() {
      const result = await invokeServicos({ action: 'obter_aviso_ativo' });
      return { aviso: result.aviso || null, aceite: result.aceite || null };
    },
    async aceitar(avisoId) {
      const result = await invokeServicos({ action: 'aceitar_aviso', aviso_id: avisoId });
      return result.aceite || null;
    },
    async getAdmin() {
      const result = await invokeServicos({ action: 'get_aviso_admin' });
      return result.aviso || null;
    },
    async listar() {
      const result = await invokeServicos({ action: 'listar_avisos' });
      return result.avisos || [];
    },
    async salvar({ id, titulo, mensagem, obrigatorio, ativo, modoTeste, requerAtualizacao, forcarInativarAnterior }) {
      const result = await invokeServicos({
        action: 'salvar_aviso',
        id: id || null,
        titulo,
        mensagem,
        obrigatorio,
        ativo,
        modo_teste: Boolean(modoTeste),
        requer_atualizacao: Boolean(requerAtualizacao),
        forcar_inativar_anterior: Boolean(forcarInativarAnterior),
      });
      return result.aviso || null;
    },
  },
  configuracaoModulo: {
    async get() {
      const result = await invokeServicos({ action: 'get_configuracao_modulo' });
      return result.row || null;
    },
    async atualizar(campos) {
      const result = await invokeServicos({
        action: 'atualizar_configuracao_modulo',
        ...campos,
      });
      return result.row || null;
    },
  },
  relatorios: {
    async financeiro(filtros) {
      const result = await invokeServicos({ action: 'relatorio_financeiro', filtros: filtros || {} });
      // `valor`/`quantidade` chegam como numeric do Postgres, que o driver serializa como
      // string (evita perda de precisao) -- precisam virar Number aqui, senao os graficos
      // (recharts soma os valores com `+`, que concatena string em vez de somar) ficam em
      // branco silenciosamente.
      const toNumberRows = (rows, keys) =>
        (rows || []).map((row) => {
          const copy = { ...row };
          keys.forEach((key) => {
            copy[key] = Number(copy[key] || 0);
          });
          return copy;
        });
      return {
        resumo: result.resumo || null,
        porCategoria: toNumberRows(result.porCategoria, ['valor', 'quantidade']),
        porStatus: toNumberRows(result.porStatus, ['valor', 'quantidade']),
        porSetor: toNumberRows(result.porSetor, ['valor', 'quantidade']),
        porUnidade: toNumberRows(result.porUnidade, ['valor', 'quantidade']),
        porDiretor: toNumberRows(result.porDiretor, ['valor', 'quantidade']),
        pendenciaPagamentoPorSetor: toNumberRows(result.pendenciaPagamentoPorSetor, ['valor', 'quantidade']),
        proximosVencimentos: toNumberRows(result.proximosVencimentos, ['valor']),
        porMes: toNumberRows(result.porMes, ['valor_solicitado', 'valor_pago']),
      };
    },
  },
  catalogosSolicitacao: {
    async list() {
      const result = await invokeServicos({ action: 'list_catalogos_solicitacao' });
      return {
        empresas: result.empresas || [],
        unidades: result.unidades || [],
        departamentos: result.departamentos || [],
        fornecedores: result.fornecedores || [],
        categorias: result.categorias || [],
        aprovadores: result.aprovadores || [],
        colaboradores: result.colaboradores || [],
      };
    },
  },
  permissoes: {
    async list() {
      const result = await invokeServicos({ action: 'list_permissoes' });
      return {
        colaboradores: result.colaboradores || [],
        permissoes: result.permissoes || [],
        modulos: result.modulos || [],
      };
    },
    async set(colaboradorId, modulo, papel) {
      const result = await invokeServicos({
        action: 'set_permissao',
        colaborador_id: colaboradorId,
        modulo,
        papel,
      });
      return result.row || null;
    },
  },
  solicitacoes: {
    async list(filters = {}) {
      const result = await invokeServicos({ action: 'list', filters });
      return result.rows || [];
    },
    async getById(id) {
      const result = await invokeServicos({ action: 'get', id });
      return result.row || null;
    },
    async create(payload) {
      const result = await invokeServicos({ action: 'create', payload });
      return result.row || null;
    },
    async update(id, payload) {
      const result = await invokeServicos({ action: 'update', id, payload });
      return result.row || null;
    },
    async setStatus(id, status, observacao_analise, confirmarSemAnexo) {
      const result = await invokeServicos({
        action: 'set_status',
        id,
        status,
        observacao_analise,
        confirmar_sem_anexo: Boolean(confirmarSemAnexo),
      });
      return result.row || null;
    },
    async marcarPendencia(id, motivo) {
      const result = await invokeServicos({ action: 'marcar_pendencia', id, motivo });
      return result.row || null;
    },
    async liberarPendencia(id, observacao) {
      const result = await invokeServicos({ action: 'liberar_pendencia', id, observacao: observacao || null });
      return result.row || null;
    },
    async cancelar(id, motivo) {
      const result = await invokeServicos({ action: 'cancelar_solicitacao', id, motivo: motivo || null });
      return result.row || null;
    },
    async reenviar(id, payload) {
      const result = await invokeServicos({ action: 'reenviar_solicitacao', id, payload });
      return result.row || null;
    },
    async deletar(id) {
      await invokeServicos({ action: 'deletar_solicitacao', id });
    },
    async marcarTeste(id, ehTeste) {
      const result = await invokeServicos({ action: 'marcar_teste', id, eh_teste: Boolean(ehTeste) });
      return result.row || null;
    },
    async getSignedUrl(id) {
      const result = await invokeServicos({ action: 'signed_url', id });
      return result.url || null;
    },
    async atualizarVencimento(id, dataVencimento) {
      const result = await invokeServicos({ action: 'atualizar_vencimento', id, data_vencimento: dataVencimento });
      return result.row || null;
    },
  },
  anexos: {
    async list(solicitacaoId) {
      const result = await invokeServicos({ action: 'list_anexos', solicitacao_id: solicitacaoId });
      return result.rows || [];
    },
    async registrar({ solicitacaoId, parcelaId, tipoAnexo, nomeArquivo, tipoMime, tamanhoBytes, storagePath, sigiloso, assinaturasNecessarias, posicaoAssinatura }) {
      const result = await invokeServicos({
        action: 'registrar_anexo',
        solicitacao_id: solicitacaoId,
        parcela_id: parcelaId || null,
        tipo_anexo: tipoAnexo,
        nome_arquivo: nomeArquivo,
        tipo_mime: tipoMime,
        tamanho_bytes: tamanhoBytes,
        storage_path: storagePath,
        sigiloso: Boolean(sigiloso),
        assinaturas_necessarias: assinaturasNecessarias === 2 ? 2 : 1,
        assinatura: posicaoAssinatura || null,
      });
      return result.row || null;
    },
    async remover(id) {
      await invokeServicos({ action: 'remover_anexo', id });
    },
    async atualizarAssinaturasNecessarias(id, assinaturasNecessarias) {
      const result = await invokeServicos({
        action: 'atualizar_anexo_assinaturas',
        id,
        assinaturas_necessarias: assinaturasNecessarias === 2 ? 2 : 1,
      });
      return result.row || null;
    },
    async assinar({ id, storagePath, nomeArquivo, tamanhoBytes, posicao }) {
      const result = await invokeServicos({
        action: 'assinar_anexo',
        id,
        storage_path: storagePath,
        nome_arquivo: nomeArquivo,
        tamanho_bytes: tamanhoBytes,
        posicao,
      });
      return result.row || null;
    },
    async substituir({ id, storagePath, nomeArquivo, tipoMime, tamanhoBytes, motivo }) {
      const result = await invokeServicos({
        action: 'substituir_anexo',
        id,
        storage_path: storagePath,
        nome_arquivo: nomeArquivo,
        tipo_mime: tipoMime,
        tamanho_bytes: tamanhoBytes,
        motivo: motivo || null,
      });
      return result.row || null;
    },
  },
  parcelas: {
    async list(solicitacaoId) {
      const result = await invokeServicos({ action: 'list_parcelas', solicitacao_id: solicitacaoId });
      return result.rows || [];
    },
    async criar(solicitacaoId, parcelas) {
      const result = await invokeServicos({ action: 'criar_parcelas', solicitacao_id: solicitacaoId, parcelas });
      return result.rows || [];
    },
    async registrarPagamento(id) {
      const result = await invokeServicos({ action: 'registrar_pagamento_parcela', id });
      return result.row || null;
    },
    async cancelar(id, motivo) {
      const result = await invokeServicos({ action: 'cancelar_parcela', id, motivo });
      return result.row || null;
    },
    async reverterPagamento(id, motivo) {
      const result = await invokeServicos({ action: 'reverter_pagamento_parcela', id, motivo });
      return result.row || null;
    },
    async atualizarVencimento(id, dataVencimento) {
      const result = await invokeServicos({ action: 'atualizar_vencimento_parcela', id, data_vencimento: dataVencimento });
      return result.row || null;
    },
  },
  historico: {
    async list(solicitacaoId) {
      const result = await invokeServicos({ action: 'historico', solicitacao_id: solicitacaoId });
      return result.rows || [];
    },
  },
  pushSubscriptions: {
    async list() {
      const result = await invokeServicos({ action: 'list_push_subscriptions' });
      return result.rows || [];
    },
    async revoke(id) {
      await invokeServicos({ action: 'revoke_push_subscription', id });
    },
  },
  notificacoes: {
    async list() {
      const result = await invokeServicos({ action: 'list_notificacoes' });
      return result.rows || [];
    },
    async marcarLida(id) {
      await invokeServicos({ action: 'marcar_notificacao_lida', id });
    },
    async marcarTodasLidas() {
      await invokeServicos({ action: 'marcar_todas_notificacoes_lidas' });
    },
  },
};
