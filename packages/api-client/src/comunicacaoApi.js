import { assertSupabaseConfigured, supabase } from './supabaseClient';
import { monitorCall } from './callMonitor';

const COMUNICACAO_ATTACHMENTS_BUCKET = 'comunicacao-anexos';
const MAX_ANEXO_BYTES = 10 * 1024 * 1024;
const ALLOWED_ANEXO_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
];

function sanitizeFileName(name = 'anexo') {
  const normalized = String(name)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'anexo';
}

function toError(message, status = 500, code, details, hint) {
  const normalizedMessage =
    typeof message === 'string' ? message : message?.message || 'Falha ao consultar a Comunicacao.';

  const error = new Error(normalizedMessage);
  error.status = status;
  if (code) error.code = code;
  if (details) error.details = details;
  if (hint) error.hint = hint;
  return error;
}

function invokeComunicacao(body = {}, accessTokenOverride) {
  return monitorCall('comunicacao-api', body, () => invokeComunicacaoRaw(body, accessTokenOverride));
}

async function invokeComunicacaoRaw(body = {}, accessTokenOverride) {
  assertSupabaseConfigured();

  const { data } = accessTokenOverride
    ? { data: { session: { access_token: accessTokenOverride } } }
    : await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (!token) {
    throw toError('Sessao expirada. Faca login novamente.', 401, 'auth_required');
  }

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/comunicacao-api`, {
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

export const comunicacaoApi = {
  auth: {
    async me(accessToken) {
      const result = await invokeComunicacao({ action: 'me' }, accessToken);
      return {
        row: result.row || null,
        access: result.access || null,
        mustChangePassword: Boolean(result.must_change_password),
      };
    },
    async clearPasswordChangeRequired() {
      return invokeComunicacao({ action: 'clear_password_change_required' });
    },
  },
  canais: {
    async list() {
      const result = await invokeComunicacao({ action: 'list_canais' });
      return result.rows || [];
    },

    async create({ nome, descricao, icone } = {}) {
      const result = await invokeComunicacao({ action: 'create_canal', nome, descricao, icone });
      return result.row || null;
    },

    async archive(canalId) {
      const result = await invokeComunicacao({ action: 'archive_canal', canal_id: canalId });
      return result.row || null;
    },

    async join(canalId) {
      const result = await invokeComunicacao({ action: 'join_canal', canal_id: canalId });
      return result.row || null;
    },

    async leave(canalId) {
      await invokeComunicacao({ action: 'leave_canal', canal_id: canalId });
    },
  },
  mensagens: {
    async list({ canalId, before, limit } = {}) {
      const result = await invokeComunicacao({
        action: 'list_mensagens',
        canal_id: canalId,
        before,
        limit,
      });
      return result.rows || [];
    },

    async create({ canalId, conteudo, anexos, respostaAId, mencoes }) {
      const result = await invokeComunicacao({
        action: 'create_mensagem',
        canal_id: canalId,
        conteudo,
        anexos,
        resposta_a_id: respostaAId || null,
        mencoes: mencoes || [],
      });
      return result.row || null;
    },

    async update(id, conteudo) {
      const result = await invokeComunicacao({
        action: 'update_mensagem',
        id,
        conteudo,
      });
      return result.row || null;
    },

    async remove(id) {
      const result = await invokeComunicacao({
        action: 'delete_mensagem',
        id,
      });
      return result.row || null;
    },
  },
  colaboradores: {
    async list({ search } = {}) {
      const result = await invokeComunicacao({ action: 'list_colaboradores', search });
      return result.rows || [];
    },
  },
  conversas: {
    async list() {
      const result = await invokeComunicacao({ action: 'list_conversas' });
      return result.rows || [];
    },

    async start(colaboradorId) {
      const result = await invokeComunicacao({ action: 'start_conversa', colaborador_id: colaboradorId });
      return result.row || null;
    },
  },
  mensagensDiretas: {
    async list({ conversaId, before, limit } = {}) {
      const result = await invokeComunicacao({
        action: 'list_mensagens_diretas',
        conversa_id: conversaId,
        before,
        limit,
      });
      return result.rows || [];
    },

    async create({ conversaId, conteudo, anexos, respostaAId, mencoes }) {
      const result = await invokeComunicacao({
        action: 'create_mensagem_direta',
        conversa_id: conversaId,
        conteudo,
        anexos,
        resposta_a_id: respostaAId || null,
        mencoes: mencoes || [],
      });
      return result.row || null;
    },

    async update(id, conteudo) {
      const result = await invokeComunicacao({
        action: 'update_mensagem_direta',
        id,
        conteudo,
      });
      return result.row || null;
    },

    async remove(id) {
      const result = await invokeComunicacao({
        action: 'delete_mensagem_direta',
        id,
      });
      return result.row || null;
    },
  },
  anexos: {
    async upload({ file, canalId, conversaId }) {
      assertSupabaseConfigured();

      if (!file) {
        throw toError('Selecione um arquivo para anexar.', 400);
      }
      if (!ALLOWED_ANEXO_MIME_TYPES.includes(file.type)) {
        throw toError('Tipo de arquivo nao permitido.', 400);
      }
      if (file.size > MAX_ANEXO_BYTES) {
        throw toError('Arquivo maior que 10MB.', 400);
      }
      if (!canalId && !conversaId) {
        throw toError('canalId ou conversaId obrigatorio.', 400);
      }

      const safeName = sanitizeFileName(file.name);
      const prefix = canalId ? `canais/${canalId}` : `conversas/${conversaId}`;
      const path = `${prefix}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

      const { error } = await supabase.storage
        .from(COMUNICACAO_ATTACHMENTS_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || undefined,
          upsert: false,
        });

      if (error) {
        throw toError(error, 500, undefined, undefined, 'Nao foi possivel enviar o anexo.');
      }

      return {
        storage_path: path,
        nome_arquivo: file.name,
        tipo_mime: file.type,
        tamanho_bytes: file.size,
      };
    },

    async getSignedUrl(path) {
      assertSupabaseConfigured();

      const { data, error } = await supabase.storage
        .from(COMUNICACAO_ATTACHMENTS_BUCKET)
        .createSignedUrl(path, 300);

      if (error) {
        throw toError(error, 500, undefined, undefined, 'Nao foi possivel abrir o anexo.');
      }

      return data.signedUrl;
    },
  },
  reacoes: {
    async toggle({ mensagemId, mensagemDiretaId, emoji }) {
      const result = await invokeComunicacao({
        action: 'toggle_reacao',
        mensagem_id: mensagemId || null,
        mensagem_direta_id: mensagemDiretaId || null,
        emoji,
      });
      return result;
    },
  },
  leituras: {
    async marcar({ canalId, conversaId } = {}) {
      await invokeComunicacao({
        action: 'marcar_lida',
        canal_id: canalId || null,
        conversa_id: conversaId || null,
      });
    },
  },
  busca: {
    async mensagens({ query, canalId, conversaId, limit } = {}) {
      const result = await invokeComunicacao({
        action: 'search_mensagens',
        query,
        canal_id: canalId || null,
        conversa_id: conversaId || null,
        limit,
      });
      return result.rows || [];
    },
  },
};
