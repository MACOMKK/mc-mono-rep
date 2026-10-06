// Edge function do modulo Oficina (sistema Servicos): Checklist Digital de
// Inspecao de Veiculos. Function separada de servicos-api (que hoje so tem o
// Financeiro) de proposito -- um bug aqui nunca derruba o deploy do
// Financeiro, ja em producao. Ver apps/servicos/CLAUDE.md para o raciocinio
// completo dessa decisao e a divida tecnica de auth compartilhada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { getServicosAuthContext } from '../_shared/servicos-auth.ts';
import {
  isValidCpfCnpj,
  isValidEmail,
  isValidTelefone,
  normalizeEmail,
  onlyDigits,
  upperOrNull,
} from '../_shared/formatacao.ts';

const SERVICOS_SCHEMA = 'gestao_servicos';
const MODULO = 'oficina';
const FOTOS_STORAGE_BUCKET = 'oficina-checklist-fotos';
const FOTO_SIGNED_URL_TTL_SECONDS = 10 * 60;
const CHECKLIST_SHARE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const checklistShareSecret = Deno.env.get('CHECKLIST_SHARE_SECRET');

const sql = databaseUrl
  ? postgres(databaseUrl, {
      prepare: false,
      max: 3,
      idle_timeout: 5,
      connect_timeout: 15,
    })
  : null;

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

function getErrorStatus(error: unknown) {
  const status = Number((error as { status?: number })?.status);
  if (Number.isFinite(status) && status >= 400) return status;
  return 500;
}

function getErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'Falha ao consultar o modulo oficina.';
  return mapDatabaseError(message);
}

function mapDatabaseError(message: string) {
  if (message.includes('idx_clientes_telefone_unique')) {
    return 'Ja existe outro cliente com este telefone.';
  }
  if (message.includes('idx_clientes_email_unique')) {
    return 'Ja existe outro cliente com este e-mail.';
  }
  if (message.includes('idx_clientes_cpf_cnpj_unique')) {
    return 'Ja existe outro cliente com este CPF/CNPJ.';
  }
  if (message.includes('veiculos_chassi_key')) {
    return 'Ja existe um veiculo com este chassi.';
  }
  if (message.includes('idx_veiculos_placa_unique')) {
    return 'Ja existe um veiculo com esta placa.';
  }
  if (message.includes('veiculos_estoque_veiculo_id_key')) {
    return 'Este veiculo ja esta no estoque do CRM.';
  }
  if (message.includes('violates foreign key constraint') && message.includes('veiculos_estoque')) {
    return 'Nao e possivel excluir: este veiculo possui proposta ou venda vinculada no CRM.';
  }
  if (message.includes('violates foreign key constraint') && message.includes('on table "clientes"')) {
    return 'Nao e possivel excluir: este cliente possui vinculos.';
  }
  return message;
}

function podeVer(moduleRole: string | null) {
  return Boolean(moduleRole) && moduleRole !== 'nenhum';
}

function podeEditar(moduleRole: string | null) {
  return moduleRole === 'inspetor' || moduleRole === 'gestor' || moduleRole === 'admin';
}

// Inspetor so enxerga os checklists da propria unidade; gestor/admin veem de
// todas as unidades.
function podeVerTodasUnidades(moduleRole: string | null) {
  return moduleRole === 'gestor' || moduleRole === 'admin';
}

function ensurePodeVer(moduleRole: string | null) {
  if (!podeVer(moduleRole)) {
    throw Object.assign(new Error('Seu usuario nao possui acesso liberado ao modulo oficina.'), { status: 403 });
  }
}

function ensurePodeEditar(moduleRole: string | null) {
  if (!podeEditar(moduleRole)) {
    throw Object.assign(new Error('Seu usuario nao pode realizar esta acao no modulo oficina.'), { status: 403 });
  }
}

// Promover veiculo pro estoque do CRM e uma decisao comercial (passa a
// aparecer disponivel pra venda), entao segue a mesma regra de quem pode
// configurar estoque no crm-api (ensureCanConfigure): so gestor/admin, nao
// inspetor.
function ensurePodeGerenciarEstoque(moduleRole: string | null) {
  if (!podeVerTodasUnidades(moduleRole)) {
    throw Object.assign(new Error('Apenas gestores e administradores podem promover o veiculo para o estoque.'), { status: 403 });
  }
}

// Exclusao de veiculo e irreversivel e derruba checklists/estoque vinculados
// (ver veiculo_excluir abaixo) -- por enquanto restrito so a admin (Camada 1),
// mais estrito que as demais acoes de escrita do modulo (inspetor/gestor).
function ensurePodeExcluirVeiculo(moduleRole: string | null) {
  if (moduleRole !== 'admin') {
    throw Object.assign(new Error('Apenas administradores podem excluir um veiculo por completo.'), { status: 403 });
  }
}

function ensurePodeExcluirCliente(moduleRole: string | null) {
  if (moduleRole !== 'admin') {
    throw Object.assign(new Error('Apenas administradores podem excluir um cliente.'), { status: 403 });
  }
}

// Mesma regra da exclusao de checklist (ver checklist_excluir abaixo): so admin, e so quando o
// proprio checklist foi marcado como eh_teste na criacao.
function ensurePodeExcluirChecklist(moduleRole: string | null) {
  if (moduleRole !== 'admin') {
    throw Object.assign(new Error('Apenas administradores podem excluir um checklist.'), { status: 403 });
  }
}

function createStorageAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function createFotoSignedUrl(path: string | null) {
  if (!path) return null;
  const storageClient = createStorageAdminClient();
  if (!storageClient) return null;

  const { data, error } = await storageClient.storage
    .from(FOTOS_STORAGE_BUCKET)
    .createSignedUrl(path, FOTO_SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.error('Failed to create signed checklist foto URL:', { path, message: error.message });
    return null;
  }

  return data?.signedUrl || null;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getChecklistShareHmacKey() {
  if (!checklistShareSecret) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(checklistShareSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// Token de link publico do checklist: HMAC sobre "checklistId.expiraEmMs",
// sem nenhum estado guardado no banco -- quem tiver um token valido e nao
// expirado (24h) consegue ler os dados desse checklist especifico, sem
// precisar de sessao/JWT de colaborador. So leitura, nunca mutacao.
async function criarTokenCompartilhamento(checklistId: string) {
  const key = await getChecklistShareHmacKey();
  if (!key) {
    throw Object.assign(new Error('CHECKLIST_SHARE_SECRET nao configurado.'), { status: 500 });
  }

  const expiraEm = Date.now() + CHECKLIST_SHARE_TOKEN_TTL_MS;
  const payload = `${checklistId}.${expiraEm}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const token = `${base64UrlEncode(new TextEncoder().encode(payload))}.${base64UrlEncode(new Uint8Array(signature))}`;
  return { token, expiresAt: expiraEm };
}

async function validarTokenCompartilhamento(checklistId: string, token: string) {
  const key = await getChecklistShareHmacKey();
  if (!key) return false;

  const [payloadPart, signaturePart] = String(token || '').split('.');
  if (!payloadPart || !signaturePart) return false;

  let payload: string;
  try {
    payload = new TextDecoder().decode(base64UrlDecode(payloadPart));
  } catch {
    return false;
  }

  const [tokenChecklistId, expiraEmRaw] = payload.split('.');
  const expiraEm = Number(expiraEmRaw);
  if (tokenChecklistId !== checklistId || !Number.isFinite(expiraEm) || expiraEm < Date.now()) {
    return false;
  }

  // Mesmo padrao de supabase/functions/whatsapp-api (validacao de webhook):
  // recalcula o HMAC com sign() e compara, em vez de usar verify() (que
  // exige um BufferSource cujo tipo o TS/deno-dom nao aceita direto a
  // partir de um Uint8Array decodificado).
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const signatureEsperada = base64UrlEncode(new Uint8Array(signature));
  return signatureEsperada === signaturePart;
}

// Inspetor so pode ver/editar checklist da propria unidade -- gestor/admin
// enxergam de todas. Lanca 404 (em vez de 403) pra nao revelar que o
// checklist existe em outra unidade.
function ensureUnidadeAcessivel(
  checklistUnidadeId: unknown,
  moduleRole: string | null,
  collaborator: Record<string, unknown> | null,
) {
  if (podeVerTodasUnidades(moduleRole)) return;
  const unidadeId = collaborator?.unidade_id ? String(collaborator.unidade_id) : null;
  if (!unidadeId || checklistUnidadeId !== unidadeId) {
    throw Object.assign(new Error('Checklist nao encontrado.'), { status: 404 });
  }
}

// Mesmo padrao do insertHistorico() do servicos-api (Financeiro, ver
// historico_solicitacao) -- autor_id fica null pro evento link_acessado,
// disparado pelo cliente anonimo via link publico.
async function insertHistoricoChecklist(
  checklistId: string,
  evento: string,
  autorId: string | null,
  observacao: string | null = null,
) {
  await sql!.unsafe(
    `insert into ${SERVICOS_SCHEMA}.historico_checklist (checklist_id, evento, autor_id, observacao) values ($1, $2, $3, $4);`,
    [checklistId, evento, autorId, observacao],
  );
}

async function getAvaliacao(id: string, moduleRole: string | null, collaborator: Record<string, unknown> | null) {
  const rows = await sql!.unsafe(
    `select * from ${SERVICOS_SCHEMA}.checklist_avaliacoes where id = $1 limit 1;`,
    [id],
  );
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Checklist nao encontrado.'), { status: 404 });
  ensureUnidadeAcessivel(row.unidade_id, moduleRole, collaborator);
  return row;
}

// Usada tanto por checklist_obter (autenticado) quanto por
// checklist_publico_obter (via token assinado) -- a checagem de quem pode
// acessar fica a cargo de cada action, essa funcao so busca os dados.
async function carregarChecklistCompleto(id: string) {
  const rows = await sql!.unsafe(
    `
      select ca.*, cl.nome as cliente_nome, cl.telefone as cliente_telefone,
        v.placa as veiculo_placa, v.chassi as veiculo_chassi, cv.nome as veiculo_cor,
        mv.nome as veiculo_modelo, c.nome as colaborador_nome, c.assinatura_url as colaborador_assinatura_url,
        u.nome as unidade_nome
      from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca
      left join public.clientes cl on cl.id = ca.cliente_id
      left join public.veiculos v on v.id = ca.veiculo_id
      left join public.cores_veiculo cv on cv.id = v.cor_id
      left join public.modelos_veiculo mv on mv.id = v.modelo_id
      left join public.colaboradores c on c.id = ca.colaborador_id
      left join public.unidades u on u.id = ca.unidade_id
      where ca.id = $1
      limit 1;
    `,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const itens = await sql!.unsafe(
    `select * from ${SERVICOS_SCHEMA}.checklist_itens where avaliacao_id = $1 order by categoria, criado_em;`,
    [id],
  );
  const avarias = await sql!.unsafe(
    `select * from ${SERVICOS_SCHEMA}.checklist_avarias where avaliacao_id = $1 order by criado_em;`,
    [id],
  );

  const fotos = await sql!.unsafe(
    `select * from ${SERVICOS_SCHEMA}.checklist_fotos where avaliacao_id = $1 order by criado_em;`,
    [id],
  );
  const fotosComUrl = await Promise.all(
    fotos.map(async (foto: Record<string, unknown>) => ({
      ...foto,
      url: await createFotoSignedUrl(String(foto.storage_path || '')),
    })),
  );

  return { row: { ...row, fotos: fotosComUrl }, itens, avarias };
}

Deno.serve(async (request) => {
  const corsHeaders = buildCorsHeaders(request);
  const json = (data: unknown, status = 200) => jsonResponse(data, status, corsHeaders);

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!sql) {
      return json({ error: 'DATABASE_URL nao configurada.' }, 500);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'checklist_listar');

    // Rota publica (link de compartilhamento via WhatsApp): sem JWT de
    // colaborador, autorizacao e via token HMAC assinado com validade de 24h
    // (ver criarTokenCompartilhamento/validarTokenCompartilhamento). Precisa
    // ficar antes de getServicosAuthContext, que exige sessao de colaborador.
    if (action === 'checklist_publico_obter') {
      const id = String(body.id || '');
      const token = String(body.token || '');
      if (!id || !token) return json({ error: 'Link invalido.' }, 400);

      const tokenValido = await validarTokenCompartilhamento(id, token);
      if (!tokenValido) return json({ error: 'Link invalido ou expirado.' }, 404);

      const dados = await carregarChecklistCompleto(id);
      if (!dados) return json({ error: 'Link invalido ou expirado.' }, 404);
      if (dados.row.status !== 'avaliado' && dados.row.status !== 'finalizado') {
        // Nao revela que o checklist existe/voltou a em_andamento -- mesma
        // mensagem generica de token invalido.
        return json({ error: 'Link invalido ou expirado.' }, 404);
      }

      await insertHistoricoChecklist(id, 'link_acessado', null);

      return json(dados);
    }

    const { collaborator, moduleRole } = await getServicosAuthContext(
      request,
      sql,
      supabaseUrl,
      supabaseAnonKey,
      MODULO,
    );

    if (action === 'me') {
      return json({ role: moduleRole, collaborator_id: collaborator?.id || null });
    }

    ensurePodeVer(moduleRole);

    if (action === 'checklist_link_compartilhar') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const avaliacao = await getAvaliacao(id, moduleRole, collaborator);
      if (avaliacao.status !== 'avaliado' && avaliacao.status !== 'finalizado') {
        return json({ error: 'So e possivel compartilhar um checklist avaliado ou finalizado.' }, 400);
      }
      const { token, expiresAt } = await criarTokenCompartilhamento(id);
      await insertHistoricoChecklist(id, 'link_compartilhado', collaborator?.id ? String(collaborator.id) : null);
      return json({ token, expires_at: expiresAt });
    }

    if (action === 'checklist_listar') {
      const status = body.status ? String(body.status) : null;
      const colaboradorId = body.colaborador_id ? String(body.colaborador_id) : null;
      const busca = body.busca ? String(body.busca).trim() : null;
      const incluirFotos = Boolean(body.incluir_fotos);
      const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 200);
      const offset = Math.max(Number(body.offset) || 0, 0);

      const conditions: string[] = [];
      const params: unknown[] = [];

      if (status) {
        params.push(status);
        conditions.push(`ca.status = $${params.length}`);
      }
      if (colaboradorId) {
        params.push(colaboradorId);
        conditions.push(`ca.colaborador_id = $${params.length}`);
      }
      if (!podeVerTodasUnidades(moduleRole)) {
        const unidadeId = collaborator?.unidade_id ? String(collaborator.unidade_id) : null;
        params.push(unidadeId);
        conditions.push(`ca.unidade_id = $${params.length}`);
      } else if (body.unidade_id) {
        params.push(String(body.unidade_id));
        conditions.push(`ca.unidade_id = $${params.length}`);
      }
      if (busca) {
        params.push(`%${busca}%`);
        conditions.push(`(cl.nome ilike $${params.length} or v.placa ilike $${params.length} or v.chassi ilike $${params.length})`);
      }

      const whereClause = conditions.length ? `where ${conditions.join(' and ')}` : '';
      params.push(limit);
      params.push(offset);

      const rows = await sql.unsafe(
        `
          select ca.*, cl.nome as cliente_nome, v.placa as veiculo_placa, v.chassi as veiculo_chassi,
            mv.nome as veiculo_modelo, c.nome as colaborador_nome, u.nome as unidade_nome, foto.storage_path as foto_thumbnail_path
          from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca
          left join public.clientes cl on cl.id = ca.cliente_id
          left join public.veiculos v on v.id = ca.veiculo_id
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.colaboradores c on c.id = ca.colaborador_id
          left join public.unidades u on u.id = ca.unidade_id
          left join lateral (
            select cf.storage_path
            from ${SERVICOS_SCHEMA}.checklist_fotos cf
            where cf.avaliacao_id = ca.id
            order by cf.criado_em
            limit 1
          ) foto on true
          ${whereClause}
          order by ca.data_entrada desc
          limit $${params.length - 1} offset $${params.length};
        `,
        params,
      );

      if (incluirFotos) {
        const rowsComFoto = await Promise.all(
          rows.map(async (row: Record<string, unknown>) => ({
            ...row,
            foto_thumbnail_url: await createFotoSignedUrl(row.foto_thumbnail_path ? String(row.foto_thumbnail_path) : null),
          })),
        );
        return json({ rows: rowsComFoto });
      }

      return json({ rows });
    }

    if (action === 'checklist_obter') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);

      const dados = await carregarChecklistCompleto(id);
      if (!dados) return json({ error: 'Checklist nao encontrado.' }, 404);

      ensureUnidadeAcessivel(dados.row.unidade_id, moduleRole, collaborator);

      const historico = await sql!.unsafe(
        `
          select h.*, c.nome as autor_nome
          from ${SERVICOS_SCHEMA}.historico_checklist h
          left join public.colaboradores c on c.id = h.autor_id
          where h.checklist_id = $1
          order by h.criado_em desc;
        `,
        [id],
      );

      return json({ ...dados, historico });
    }

    if (action === 'checklist_iniciar') {
      ensurePodeEditar(moduleRole);

      const veiculoId = String(body.veiculo_id || '');
      if (!veiculoId) return json({ error: 'veiculo_id obrigatorio.' }, 400);

      const clienteId = body.cliente_id ? String(body.cliente_id) : null;
      const colaboradorId = body.colaborador_id ? String(body.colaborador_id) : String(collaborator!.id);
      const os = upperOrNull(body.os);
      const km = body.km != null ? Number(body.km) : null;
      // Unidade parte da unidade do colaborador que esta criando o checklist,
      // mas pode ser trocada na tela (ex.: inspetor cobrindo outra unidade) --
      // ela define quem enxerga o checklist depois, ver ensureUnidadeAcessivel,
      // e agora tambem a numeracao (ver "numero" abaixo).
      const unidadeId = body.unidade_id ? String(body.unidade_id) : collaborator?.unidade_id ? String(collaborator.unidade_id) : null;
      if (!unidadeId) return json({ error: 'unidade_id obrigatorio.' }, 400);

      // eh_teste nao e aceito de qualquer solicitante -- so admin pode marcar o proprio
      // checklist como teste na criacao (mesmo padrao de solicitacoes_pagamento.eh_teste no
      // Financeiro, ver servicos-api/index.ts).
      const ehTeste = body.eh_teste === true && moduleRole === 'admin';

      // Numeracao por unidade (nao mais uma sequence global): trava com um
      // advisory lock escopado a unidade pra serializar criacoes concorrentes
      // na mesma unidade, calcula o proximo numero e insere na mesma
      // transacao -- a constraint unique(unidade_id, numero) da migration
      // cobre qualquer brecha residual. A checagem de "dono diferente" tambem
      // entra aqui (era 1 round-trip sequencial antes da transacao) --
      // mesma lógica, so que agora paga o custo de rede junto com o resto.
      let avisoDonoDiferente: { atual_id: unknown; atual_nome: unknown } | null = null;
      const rows = await sql.begin(async (trx) => {
        if (clienteId) {
          const veiculoRows = await trx.unsafe(
            `
              select v.cliente_atual_id, c.nome as cliente_atual_nome
              from public.veiculos v
              left join public.clientes c on c.id = v.cliente_atual_id
              where v.id = $1
              limit 1;
            `,
            [veiculoId],
          );
          const veiculoAtual = veiculoRows[0];
          if (veiculoAtual?.cliente_atual_id && veiculoAtual.cliente_atual_id !== clienteId) {
            avisoDonoDiferente = { atual_id: veiculoAtual.cliente_atual_id, atual_nome: veiculoAtual.cliente_atual_nome };
          }
        }

        await trx.unsafe(`select pg_advisory_xact_lock(hashtextextended($1::text, 0));`, [unidadeId]);
        const proximoRows = await trx.unsafe(
          `select coalesce(max(numero), 0) + 1 as proximo from ${SERVICOS_SCHEMA}.checklist_avaliacoes where unidade_id = $1;`,
          [unidadeId],
        );
        const numero = Number(proximoRows[0].proximo);
        const insertRows = await trx.unsafe(
          `
            insert into ${SERVICOS_SCHEMA}.checklist_avaliacoes
              (veiculo_id, cliente_id, colaborador_id, os, km, unidade_id, numero, eh_teste)
            values ($1, $2, $3, $4, $5, $6, $7, $8)
            returning *;
          `,
          [veiculoId, clienteId, colaboradorId, os, km, unidadeId, numero, ehTeste],
        );
        await trx.unsafe(
          `insert into ${SERVICOS_SCHEMA}.historico_checklist (checklist_id, evento, autor_id, observacao) values ($1, $2, $3, $4);`,
          [String(insertRows[0].id), 'criado', collaborator?.id ? String(collaborator.id) : null, null],
        );
        return insertRows;
      });

      return json({ row: rows[0], aviso_dono_diferente: avisoDonoDiferente }, 201);
    }

    if (action === 'checklist_atualizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const currentRow = await getAvaliacao(id, moduleRole, collaborator);

      // So entra em `campos` (e portanto so vira update + evento de historico) o que
      // realmente mudou em relacao ao valor ja salvo -- o wizard (ChecklistForm.jsx)
      // chama essa action a cada "Avancar", mesmo sem alteracao (ex.: reabrir um
      // checklist ja preenchido e so navegar pelas etapas), e sem essa checagem isso
      // gerava um evento "editado" fantasma no historico a cada passo.
      const campos: Record<string, unknown> = {};
      if (body.km != null && Number(body.km) !== Number(currentRow.km)) {
        campos.km = Number(body.km);
      }
      if (body.nivel_combustivel != null && Number(body.nivel_combustivel) !== Number(currentRow.nivel_combustivel)) {
        campos.nivel_combustivel = Number(body.nivel_combustivel);
      }
      if (body.pintura_suja != null && Boolean(body.pintura_suja) !== Boolean(currentRow.pintura_suja)) {
        campos.pintura_suja = Boolean(body.pintura_suja);
      }
      if (body.observacoes !== undefined) {
        const novo = upperOrNull(body.observacoes);
        if (novo !== (currentRow.observacoes ?? null)) campos.observacoes = novo;
      }
      if (body.os !== undefined) {
        const novo = upperOrNull(body.os);
        if (novo !== (currentRow.os ?? null)) campos.os = novo;
      }
      if (body.comunicacoes !== undefined) {
        const novoArray = Array.isArray(body.comunicacoes) ? body.comunicacoes : [];
        // Nao fazer JSON.stringify aqui: como o SET usa `$n::jsonb`, o driver
        // postgres.js ja detecta o tipo jsonb do parametro (via describe do
        // prepared statement) e serializa o array sozinho -- stringificar
        // manualmente antes gerava double-encoding (jsonb guardando uma STRING
        // com o JSON dentro, em vez de um array de verdade; Array.isArray()
        // no frontend dava false ao reabrir e o campo parecia "nao salvo").
        const atual = JSON.stringify(currentRow.comunicacoes ?? []);
        if (JSON.stringify(novoArray) !== atual) campos.comunicacoes = novoArray;
      }
      if (body.assinatura_entrada !== undefined) {
        const novo = body.assinatura_entrada ? String(body.assinatura_entrada) : null;
        if (novo !== (currentRow.assinatura_entrada ?? null)) campos.assinatura_entrada = novo;
      }
      if (body.assinatura_entrada_nome !== undefined) {
        const novo = upperOrNull(body.assinatura_entrada_nome);
        if (novo !== (currentRow.assinatura_entrada_nome ?? null)) campos.assinatura_entrada_nome = novo;
      }
      if (body.assinatura_entrada_vinculo !== undefined) {
        const novo = upperOrNull(body.assinatura_entrada_vinculo);
        if (novo !== (currentRow.assinatura_entrada_vinculo ?? null)) campos.assinatura_entrada_vinculo = novo;
      }
      if (body.assinatura_entrada_detalhe_vinculo !== undefined) {
        const novo = upperOrNull(body.assinatura_entrada_detalhe_vinculo);
        if (novo !== (currentRow.assinatura_entrada_detalhe_vinculo ?? null)) {
          campos.assinatura_entrada_detalhe_vinculo = novo;
        }
      }
      if (body.unidade_id !== undefined) {
        const novo = body.unidade_id ? String(body.unidade_id) : null;
        if (novo !== (currentRow.unidade_id ?? null)) campos.unidade_id = novo;
      }

      const fields = Object.keys(campos);
      if (!fields.length) return json({ row: currentRow });

      const setClause = fields
        .map((field, index) => `${field} = $${index + 2}${field === 'comunicacoes' ? '::jsonb' : ''}`)
        .join(', ');
      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_avaliacoes
          set ${setClause}
          where id = $1
          returning *;
        `,
        [id, ...fields.map((field) => campos[field])],
      );

      if (rows[0]) {
        await insertHistoricoChecklist(
          id,
          'editado',
          collaborator?.id ? String(collaborator.id) : null,
          `Campos alterados: ${fields.join(', ')}.`,
        );
      }

      return json({ row: rows[0] });
    }

    if (action === 'checklist_concluir_avaliacao') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id, moduleRole, collaborator);

      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_avaliacoes
          set status = 'avaliado'
          where id = $1 and status = 'em_andamento'
          returning *;
        `,
        [id],
      );

      if (rows[0]) {
        await insertHistoricoChecklist(id, 'avaliado', collaborator?.id ? String(collaborator.id) : null);
      }

      return json({ row: rows[0] });
    }

    if (action === 'checklist_finalizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id, moduleRole, collaborator);

      const entregaObservacoes = upperOrNull(body.entrega_observacoes);
      const assinaturaSaida = body.assinatura_saida ? String(body.assinatura_saida) : null;
      const assinaturaSaidaNome = upperOrNull(body.assinatura_saida_nome);
      const assinaturaSaidaVinculo = upperOrNull(body.assinatura_saida_vinculo);
      const assinaturaSaidaDetalheVinculo = upperOrNull(body.assinatura_saida_detalhe_vinculo);
      const entregaConferida = Boolean(body.entrega_conferida);

      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_avaliacoes
          set status = 'finalizado',
            data_saida = now(),
            entrega_conferida = $2,
            entrega_observacoes = $3,
            assinatura_saida = coalesce($4, assinatura_saida),
            assinatura_saida_nome = coalesce($5, assinatura_saida_nome),
            assinatura_saida_vinculo = coalesce($6, assinatura_saida_vinculo),
            assinatura_saida_detalhe_vinculo = coalesce($7, assinatura_saida_detalhe_vinculo)
          where id = $1
          returning *;
        `,
        [
          id,
          entregaConferida,
          entregaObservacoes,
          assinaturaSaida,
          assinaturaSaidaNome,
          assinaturaSaidaVinculo,
          assinaturaSaidaDetalheVinculo,
        ],
      );

      if (rows[0]) {
        await insertHistoricoChecklist(id, 'finalizado', collaborator?.id ? String(collaborator.id) : null);
      }

      return json({ row: rows[0] });
    }

    if (action === 'checklist_itens_upsert') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      if (!avaliacaoId) return json({ error: 'avaliacao_id obrigatorio.' }, 400);
      await getAvaliacao(avaliacaoId, moduleRole, collaborator);

      const itens = Array.isArray(body.itens) ? body.itens : [];
      const categoria = body.categoria ? String(body.categoria) : null;
      if (!categoria) return json({ error: 'categoria obrigatoria.' }, 400);

      const itensAtuais = await sql.unsafe(
        `select item, status from ${SERVICOS_SCHEMA}.checklist_itens where avaliacao_id = $1 and categoria = $2 order by item;`,
        [avaliacaoId, categoria],
      );

      // Mesmo motivo do checklist_atualizar acima: o wizard salva a cada "Avancar"
      // mesmo sem alterar nada nessa categoria (ex.: reabrir e so navegar pelas
      // etapas). So faz o delete+insert (e loga "itens_atualizados") se o conjunto
      // de itens realmente mudou.
      const normalizarItens = (lista: Array<{ item?: unknown; status?: unknown }>) =>
        lista
          .map((item) => ({
            item: String(item?.item || '').trim(),
            status: item?.status ? String(item.status) : null,
          }))
          .filter((item) => item.item)
          .sort((a, b) => a.item.localeCompare(b.item));

      const novoNormalizado = normalizarItens(itens);
      const atualNormalizado = normalizarItens(itensAtuais as Array<{ item?: unknown; status?: unknown }>);
      const mudou = JSON.stringify(novoNormalizado) !== JSON.stringify(atualNormalizado);

      if (!mudou) {
        return json({ rows: itensAtuais });
      }

      await sql.begin(async (trx) => {
        await trx.unsafe(
          `delete from ${SERVICOS_SCHEMA}.checklist_itens where avaliacao_id = $1 and categoria = $2;`,
          [avaliacaoId, categoria],
        );

        for (const item of itens) {
          const nomeItem = String(item?.item || '').trim();
          if (!nomeItem) continue;
          await trx.unsafe(
            `
              insert into ${SERVICOS_SCHEMA}.checklist_itens (avaliacao_id, categoria, item, status)
              values ($1, $2, $3, $4);
            `,
            [avaliacaoId, categoria, nomeItem, item?.status ? String(item.status) : null],
          );
        }
      });

      const rows = await sql.unsafe(
        `select * from ${SERVICOS_SCHEMA}.checklist_itens where avaliacao_id = $1 order by categoria, criado_em;`,
        [avaliacaoId],
      );

      await insertHistoricoChecklist(
        avaliacaoId,
        'itens_atualizados',
        collaborator?.id ? String(collaborator.id) : null,
        `Itens de "${categoria}" atualizados (${itens.length}).`,
      );

      return json({ rows });
    }

    if (action === 'checklist_avaria_adicionar') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      const tipo = String(body.tipo || '');
      const posX = Number(body.pos_x);
      const posY = Number(body.pos_y);

      if (!avaliacaoId || !tipo || !Number.isFinite(posX) || !Number.isFinite(posY)) {
        return json({ error: 'avaliacao_id, tipo, pos_x e pos_y sao obrigatorios.' }, 400);
      }
      await getAvaliacao(avaliacaoId, moduleRole, collaborator);

      const rows = await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.checklist_avarias (avaliacao_id, tipo, pos_x, pos_y, area, observacao)
          values ($1, $2, $3, $4, $5, $6)
          returning *;
        `,
        [avaliacaoId, tipo, posX, posY, upperOrNull(body.area), upperOrNull(body.observacao)],
      );

      await insertHistoricoChecklist(
        avaliacaoId,
        'avaria_adicionada',
        collaborator?.id ? String(collaborator.id) : null,
        `Avaria "${tipo}" registrada${body.area ? ` em ${body.area}` : ''}.`,
      );

      return json({ row: rows[0] }, 201);
    }

    if (action === 'checklist_avaria_remover') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);

      const avariaRows = await sql.unsafe(
        `select avaliacao_id from ${SERVICOS_SCHEMA}.checklist_avarias where id = $1 limit 1;`,
        [id],
      );
      const avaria = avariaRows[0];
      if (!avaria) return json({ error: 'Avaria nao encontrada.' }, 404);
      await getAvaliacao(String(avaria.avaliacao_id), moduleRole, collaborator);

      await sql.unsafe(`delete from ${SERVICOS_SCHEMA}.checklist_avarias where id = $1;`, [id]);

      await insertHistoricoChecklist(
        String(avaria.avaliacao_id),
        'avaria_removida',
        collaborator?.id ? String(collaborator.id) : null,
      );

      return json({ ok: true });
    }

    if (action === 'checklist_foto_registrar') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      const storagePath = String(body.storage_path || '');
      if (!avaliacaoId || !storagePath) {
        return json({ error: 'avaliacao_id e storage_path sao obrigatorios.' }, 400);
      }
      await getAvaliacao(avaliacaoId, moduleRole, collaborator);

      let avariaId = body.avaria_id ? String(body.avaria_id) : null;
      if (avariaId) {
        const avariaRows = await sql.unsafe(
          `select id from ${SERVICOS_SCHEMA}.checklist_avarias where id = $1 and avaliacao_id = $2 limit 1;`,
          [avariaId, avaliacaoId],
        );
        if (!avariaRows[0]) return json({ error: 'Avaria nao encontrada para este checklist.' }, 400);
      }

      const rows = await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.checklist_fotos (avaliacao_id, storage_path, categoria, legenda, avaria_id)
          values ($1, $2, $3, $4, $5)
          returning *;
        `,
        [avaliacaoId, storagePath, body.categoria ? String(body.categoria) : null, upperOrNull(body.legenda), avariaId],
      );

      await insertHistoricoChecklist(avaliacaoId, 'foto_adicionada', collaborator?.id ? String(collaborator.id) : null);

      return json({ row: rows[0], url: await createFotoSignedUrl(storagePath) }, 201);
    }

    if (action === 'checklist_foto_atualizar') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      const storagePath = String(body.storage_path || '');
      if (!avaliacaoId || !storagePath) {
        return json({ error: 'avaliacao_id e storage_path sao obrigatorios.' }, 400);
      }
      await getAvaliacao(avaliacaoId, moduleRole, collaborator);

      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_fotos
          set categoria = $3, legenda = $4
          where avaliacao_id = $1 and storage_path = $2
          returning *;
        `,
        [avaliacaoId, storagePath, body.categoria ? String(body.categoria) : null, upperOrNull(body.legenda)],
      );
      if (!rows[0]) return json({ error: 'Foto nao encontrada.' }, 404);

      return json({ row: rows[0] });
    }

    if (action === 'checklist_foto_remover') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      const storagePath = String(body.storage_path || '');
      if (!avaliacaoId || !storagePath) {
        return json({ error: 'avaliacao_id e storage_path sao obrigatorios.' }, 400);
      }
      await getAvaliacao(avaliacaoId, moduleRole, collaborator);

      const rows = await sql.unsafe(
        `
          delete from ${SERVICOS_SCHEMA}.checklist_fotos
          where avaliacao_id = $1 and storage_path = $2
          returning *;
        `,
        [avaliacaoId, storagePath],
      );

      const storageClient = createStorageAdminClient();
      if (storageClient) {
        await storageClient.storage.from(FOTOS_STORAGE_BUCKET).remove([storagePath]);
      }

      await insertHistoricoChecklist(avaliacaoId, 'foto_removida', collaborator?.id ? String(collaborator.id) : null);

      return json({ row: rows[0] || null });
    }

    if (action === 'cliente_buscar') {
      const busca = String(body.busca || '').trim();
      if (!busca) return json({ rows: [] });

      const rows = await sql.unsafe(
        `
          select id, nome, telefone, email, cpf_cnpj
          from public.clientes
          where nome ilike $1
            or ($2 <> '' and (telefone_normalizado like $2 or cpf_cnpj_normalizado like $2))
          order by nome
          limit 20;
        `,
        // Telefone/CPF/CNPJ sao guardados so com digitos (mesmo em clientes antigos, via
        // *_normalizado), entao a busca por eles ignora mascara; vazio desliga o ramo.
        [`%${busca}%`, onlyDigits(busca) ? `%${onlyDigits(busca)}%` : ''],
      );

      return json({ rows });
    }

    if (action === 'cliente_criar') {
      ensurePodeEditar(moduleRole);
      // Padronizacao: nome em MAIUSCULO, telefone e CPF/CNPJ so digitos, e-mail minusculo.
      // As colunas *_normalizado (usadas nos indices unicos) ficam iguais as colunas exibidas.
      const nome = upperOrNull(body.nome);
      const telefone = onlyDigits(body.telefone);
      if (!nome || !telefone) return json({ error: 'nome e telefone sao obrigatorios.' }, 400);
      if (!isValidTelefone(telefone)) return json({ error: 'Telefone invalido. Informe DDD + numero (10 ou 11 digitos).' }, 400);

      const email = normalizeEmail(body.email);
      if (email && !isValidEmail(email)) return json({ error: 'E-mail invalido.' }, 400);
      const cpfCnpj = onlyDigits(body.cpf_cnpj) || null;
      if (cpfCnpj && !isValidCpfCnpj(cpfCnpj)) return json({ error: 'CPF/CNPJ invalido.' }, 400);

      // Mesma regra do checklist_iniciar: so admin pode marcar como teste, e so na criacao.
      const ehTeste = body.eh_teste === true && moduleRole === 'admin';

      const rows = await sql.unsafe(
        `
          insert into public.clientes
            (nome, telefone, telefone_normalizado, email, email_normalizado, cpf_cnpj, cpf_cnpj_normalizado, eh_teste)
          values ($1, $2, $3, $4, $5, $6, $7, $8)
          returning id, nome, telefone, email, cpf_cnpj, eh_teste;
        `,
        [nome, telefone, telefone, email, email, cpfCnpj, cpfCnpj, ehTeste],
      );

      return json({ row: rows[0] }, 201);
    }

    if (action === 'cliente_listar') {
      const busca = String(body.busca || '').trim();
      const digitos = onlyDigits(busca);

      const rows = await sql.unsafe(
        `
          select c.id, c.nome, c.telefone, c.email, c.cpf_cnpj, c.eh_teste,
            (select count(*) from public.veiculos v where v.cliente_atual_id = c.id) as total_veiculos,
            (select count(*) from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca where ca.cliente_id = c.id) as total_checklists
          from public.clientes c
          where $1 = ''
            or c.nome ilike '%' || $1 || '%'
            or c.email ilike '%' || $1 || '%'
            or ($2 <> '' and (c.telefone_normalizado like '%' || $2 || '%' or c.cpf_cnpj_normalizado like '%' || $2 || '%'))
          order by c.nome
          limit 500;
        `,
        [busca, digitos],
      );

      return json({ rows });
    }

    if (action === 'cliente_obter') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);

      const clienteRows = await sql.unsafe(
        `select id, nome, telefone, email, cpf_cnpj, eh_teste from public.clientes where id = $1;`,
        [id],
      );
      const cliente = clienteRows[0];
      if (!cliente) return json({ error: 'Cliente nao encontrado.' }, 404);

      const veiculos = await sql.unsafe(
        `
          select v.id, v.placa, v.chassi, cv.nome as cor, mv.nome as modelo_nome, ma.nome as marca_nome
          from public.veiculos v
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.marcas_veiculo ma on ma.id = mv.marca_id
          left join public.cores_veiculo cv on cv.id = v.cor_id
          where v.cliente_atual_id = $1
          order by v.atualizado_em desc;
        `,
        [id],
      );

      const checklists = await sql.unsafe(
        `
          select ca.*, cl.nome as cliente_nome, v.placa as veiculo_placa, v.chassi as veiculo_chassi,
            mv.nome as veiculo_modelo, c.nome as colaborador_nome
          from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca
          left join public.clientes cl on cl.id = ca.cliente_id
          left join public.veiculos v on v.id = ca.veiculo_id
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.colaboradores c on c.id = ca.colaborador_id
          where ca.cliente_id = $1
          order by ca.data_entrada desc
          limit 50;
        `,
        [id],
      );

      return json({ cliente, veiculos, checklists });
    }

    // Edita o registro global de public.clientes (compartilhado com o CRM). Mesma padronizacao
    // do cliente_criar; as colunas *_normalizado acompanham as colunas exibidas.
    if (action === 'cliente_atualizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'id e obrigatorio.' }, 400);

      const nome = upperOrNull(body.nome);
      const telefone = onlyDigits(body.telefone);
      if (!nome || !telefone) return json({ error: 'nome e telefone sao obrigatorios.' }, 400);
      if (!isValidTelefone(telefone)) return json({ error: 'Telefone invalido. Informe DDD + numero (10 ou 11 digitos).' }, 400);

      const email = normalizeEmail(body.email);
      if (email && !isValidEmail(email)) return json({ error: 'E-mail invalido.' }, 400);
      const cpfCnpj = onlyDigits(body.cpf_cnpj) || null;
      if (cpfCnpj && !isValidCpfCnpj(cpfCnpj)) return json({ error: 'CPF/CNPJ invalido.' }, 400);

      const rows = await sql.unsafe(
        `
          update public.clientes
          set nome = $2, telefone = $3, telefone_normalizado = $3,
              email = $4, email_normalizado = $4,
              cpf_cnpj = $5, cpf_cnpj_normalizado = $5
          where id = $1
          returning id, nome, telefone, email, cpf_cnpj;
        `,
        [id, nome, telefone, email, cpfCnpj],
      );
      if (!rows[0]) return json({ error: 'Cliente nao encontrado.' }, 404);

      return json({ row: rows[0] });
    }

    // Exclusao de cliente: public.clientes e compartilhada com o CRM, entao nao ha cascata --
    // qualquer vinculo (veiculo, historico de proprietarios, checklist, cadastro no CRM) bloqueia.
    // As FKs "restrict" ficam como rede de seguranca (mapDatabaseError traduz o 23503).
    // Nota: exclusao NAO e condicionada a eh_teste=true (diferente de checklist_excluir) --
    // ja e admin-only e ja exige ausencia de vinculos, o que e seguranca suficiente; gatear
    // por eh_teste quebraria o uso legitimo de excluir um cadastro real sem vinculo.
    if (action === 'cliente_excluir') {
      ensurePodeExcluirCliente(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'id e obrigatorio.' }, 400);

      const vinculos = await sql.unsafe(
        `
          select
            (select count(*)::int from public.veiculos where cliente_atual_id = $1) as veiculos,
            (select count(*)::int from public.veiculos_proprietarios where cliente_id = $1) as proprietarios,
            (select count(*)::int from ${SERVICOS_SCHEMA}.checklist_avaliacoes where cliente_id = $1) as checklists,
            (select count(*)::int from gestao_crm.clientes_crm where id = $1) as crm;
        `,
        [id],
      );
      const v = vinculos[0];
      const motivos: string[] = [];
      if (v.veiculos > 0) motivos.push(`${v.veiculos} veiculo(s)`);
      if (v.proprietarios > 0 && v.veiculos === 0) motivos.push('historico de proprietario de veiculo');
      if (v.checklists > 0) motivos.push(`${v.checklists} checklist(s)`);
      if (v.crm > 0) motivos.push('cadastro no CRM');
      if (motivos.length > 0) {
        return json({ error: `Cliente nao pode ser excluido: possui vinculos (${motivos.join(', ')}).` }, 400);
      }

      const rows = await sql.unsafe(`delete from public.clientes where id = $1 returning id;`, [id]);
      if (!rows[0]) return json({ error: 'Cliente nao encontrado.' }, 404);

      return json({ success: true });
    }

    if (action === 'veiculo_buscar') {
      const busca = String(body.busca || '').trim();
      if (!busca) return json({ rows: [] });

      const rows = await sql.unsafe(
        `
          select v.id, v.placa, v.chassi, cv.nome as cor, v.km, mv.nome as modelo_nome, ma.nome as marca_nome,
            v.cliente_atual_id, c.nome as cliente_atual_nome
          from public.veiculos v
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.marcas_veiculo ma on ma.id = mv.marca_id
          left join public.cores_veiculo cv on cv.id = v.cor_id
          left join public.clientes c on c.id = v.cliente_atual_id
          where v.placa ilike $1 or v.chassi ilike $1
          order by v.placa
          limit 20;
        `,
        [`%${busca}%`],
      );

      return json({ rows });
    }

    if (action === 'veiculo_listar') {
      const busca = String(body.busca || '').trim();

      const rows = await sql.unsafe(
        `
          select
            v.id, v.placa, v.chassi, cv.nome as cor, v.km, v.eh_teste,
            mv.nome as modelo_nome, ma.nome as marca_nome,
            v.cliente_atual_id, c.nome as cliente_atual_nome,
            (select count(*) from gestao_servicos.checklist_avaliacoes ca where ca.veiculo_id = v.id) as total_checklists,
            exists (
              select 1 from gestao_crm.veiculos_estoque ve
              where ve.veiculo_id = v.id
                and (
                  exists (select 1 from gestao_crm.propostas p where p.veiculo_estoque_id = ve.id)
                  or exists (select 1 from gestao_crm.vendas vd where vd.veiculo_estoque_id = ve.id)
                )
            ) as tem_proposta_venda
          from public.veiculos v
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.marcas_veiculo ma on ma.id = mv.marca_id
          left join public.cores_veiculo cv on cv.id = v.cor_id
          left join public.clientes c on c.id = v.cliente_atual_id
          where $1 = '' or v.placa ilike '%' || $1 || '%' or v.chassi ilike '%' || $1 || '%'
          order by v.atualizado_em desc
          limit 500;
        `,
        [busca],
      );

      return json({ rows });
    }

    if (action === 'veiculo_obter') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);

      const veiculoRows = await sql.unsafe(
        `
          select
            v.id, v.placa, v.chassi, cv.nome as cor, v.km, v.eh_teste,
            v.modelo_id, v.versao_id, v.cor_id, mv.marca_id,
            mv.nome as modelo_nome, ma.nome as marca_nome,
            v.cliente_atual_id, c.nome as cliente_atual_nome,
            ve.id as estoque_id, ve.status as estoque_status,
            exists (
              select 1 from gestao_crm.propostas p where p.veiculo_estoque_id = ve.id
              union all
              select 1 from gestao_crm.vendas vd where vd.veiculo_estoque_id = ve.id
            ) as tem_proposta_venda
          from public.veiculos v
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.marcas_veiculo ma on ma.id = mv.marca_id
          left join public.cores_veiculo cv on cv.id = v.cor_id
          left join public.clientes c on c.id = v.cliente_atual_id
          left join gestao_crm.veiculos_estoque ve on ve.veiculo_id = v.id
          where v.id = $1;
        `,
        [id],
      );

      const veiculo = veiculoRows[0];
      if (!veiculo) return json({ error: 'Veiculo nao encontrado.' }, 404);

      const proprietarios = await sql.unsafe(
        `
          select vp.id, vp.cliente_id, cl.nome as cliente_nome, vp.desde, vp.ate
          from public.veiculos_proprietarios vp
          left join public.clientes cl on cl.id = vp.cliente_id
          where vp.veiculo_id = $1
          order by vp.desde desc;
        `,
        [id],
      );

      const checklists = await sql.unsafe(
        `
          select ca.*, cl.nome as cliente_nome, v.placa as veiculo_placa, v.chassi as veiculo_chassi,
            mv.nome as veiculo_modelo, c.nome as colaborador_nome, foto.storage_path as foto_thumbnail_path
          from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca
          left join public.clientes cl on cl.id = ca.cliente_id
          left join public.veiculos v on v.id = ca.veiculo_id
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.colaboradores c on c.id = ca.colaborador_id
          left join lateral (
            select cf.storage_path
            from ${SERVICOS_SCHEMA}.checklist_fotos cf
            where cf.avaliacao_id = ca.id
            order by cf.criado_em
            limit 1
          ) foto on true
          where ca.veiculo_id = $1
          order by ca.data_entrada desc;
        `,
        [id],
      );

      const checklistsComFoto = await Promise.all(
        checklists.map(async (row: Record<string, unknown>) => ({
          ...row,
          foto_thumbnail_url: await createFotoSignedUrl(row.foto_thumbnail_path ? String(row.foto_thumbnail_path) : null),
        })),
      );

      return json({ veiculo, proprietarios, checklists: checklistsComFoto });
    }

    if (action === 'veiculo_transferir') {
      ensurePodeEditar(moduleRole);
      const veiculoId = String(body.veiculo_id || '');
      const clienteId = String(body.cliente_id || '');
      if (!veiculoId || !clienteId) return json({ error: 'veiculo_id e cliente_id sao obrigatorios.' }, 400);

      const row = await sql.begin(async (trx) => {
        await trx.unsafe(
          `update public.veiculos_proprietarios set ate = now() where veiculo_id = $1 and ate is null;`,
          [veiculoId],
        );
        await trx.unsafe(
          `insert into public.veiculos_proprietarios (veiculo_id, cliente_id) values ($1, $2);`,
          [veiculoId, clienteId],
        );
        const rows = await trx.unsafe(
          `update public.veiculos set cliente_atual_id = $2 where id = $1 returning id, cliente_atual_id;`,
          [veiculoId, clienteId],
        );
        return rows[0];
      });

      if (!row) return json({ error: 'Veiculo nao encontrado.' }, 404);
      return json({ row });
    }

    if (action === 'veiculo_promover_estoque') {
      ensurePodeGerenciarEstoque(moduleRole);
      const veiculoId = String(body.veiculo_id || '');
      if (!veiculoId) return json({ error: 'veiculo_id e obrigatorio.' }, 400);

      const veiculoRows = await sql.unsafe(`select id from public.veiculos where id = $1;`, [veiculoId]);
      if (!veiculoRows[0]) return json({ error: 'Veiculo nao encontrado.' }, 404);

      const condicao = ['novo', 'seminovo', 'usado'].includes(String(body.condicao || ''))
        ? String(body.condicao)
        : 'seminovo';
      const preco = body.preco != null && body.preco !== '' ? Number(body.preco) : null;
      const observacoes = upperOrNull(body.observacoes);

      const rows = await sql.unsafe(
        `
          insert into gestao_crm.veiculos_estoque (veiculo_id, condicao, preco, observacoes, criado_por)
          values ($1, $2, $3, $4, $5)
          returning id, veiculo_id, condicao, status, preco, observacoes;
        `,
        [veiculoId, condicao, preco, observacoes, collaborator?.id || null],
      );

      return json({ row: rows[0] }, 201);
    }

    if (action === 'veiculo_criar') {
      ensurePodeEditar(moduleRole);
      const modeloId = String(body.modelo_id || '');
      const chassi = String(body.chassi || '').trim().toUpperCase();
      if (!modeloId || !chassi) return json({ error: 'modelo_id e chassi sao obrigatorios.' }, 400);

      const placa = body.placa ? String(body.placa).trim().toUpperCase().replace(/\s+/g, '') : null;

      // Mesma regra do checklist_iniciar: so admin pode marcar como teste, e so na criacao.
      const ehTeste = body.eh_teste === true && moduleRole === 'admin';

      const rows = await sql.unsafe(
        `
          insert into public.veiculos (modelo_id, versao_id, chassi, placa, cor_id, km, eh_teste)
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id, placa, chassi, cor_id, km, eh_teste;
        `,
        [
          modeloId,
          body.versao_id ? String(body.versao_id) : null,
          chassi,
          placa,
          body.cor_id ? String(body.cor_id) : null,
          body.km != null ? Number(body.km) : null,
          ehTeste,
        ],
      );

      return json({ row: rows[0] }, 201);
    }

    // Corrige os dados do veiculo. Nao mexe em cliente_atual_id (troca de dono e so via
    // veiculo_transferir, que preserva o historico de proprietarios).
    if (action === 'veiculo_atualizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      const modeloId = String(body.modelo_id || '');
      const chassi = String(body.chassi || '').trim().toUpperCase().replace(/\s+/g, '');
      if (!id) return json({ error: 'id e obrigatorio.' }, 400);
      if (!modeloId || !chassi) return json({ error: 'modelo_id e chassi sao obrigatorios.' }, 400);

      const placa = body.placa ? String(body.placa).trim().toUpperCase().replace(/\s+/g, '') : null;
      const km = body.km != null && body.km !== '' ? Number(body.km) : null;
      if (km != null && (!Number.isFinite(km) || km < 0)) return json({ error: 'Km invalido.' }, 400);

      const rows = await sql.unsafe(
        `
          update public.veiculos
          set modelo_id = $2, versao_id = $3, chassi = $4, placa = $5, cor_id = $6, km = $7
          where id = $1
          returning id, placa, chassi, cor_id, km;
        `,
        [
          id,
          modeloId,
          body.versao_id ? String(body.versao_id) : null,
          chassi,
          placa,
          body.cor_id ? String(body.cor_id) : null,
          km,
        ],
      );
      if (!rows[0]) return json({ error: 'Veiculo nao encontrado.' }, 404);

      return json({ row: rows[0] });
    }

    // Exclusao completa (fisica) do veiculo -- usada pra limpar dados de
    // teste. Diferente de qualquer delete generico: apaga em cascata os
    // checklists do veiculo (checklist_avaliacoes tem "on delete restrict"
    // pra public.veiculos, entao precisa ser apagado primeiro; os filhos
    // -- itens/avarias/fotos/historico -- ja cascateiam a partir dele) e a
    // extensao de estoque no CRM antes do proprio public.veiculos. Se o
    // veiculo tiver proposta/venda vinculada no CRM, o delete de
    // veiculos_estoque falha por FK e mapDatabaseError devolve mensagem
    // amigavel -- nesse caso nao ha exclusao parcial (tudo roda numa
    // transacao so). Nota: NAO e condicionada a eh_teste=true (diferente de
    // checklist_excluir) -- ja e admin-only e ja exige ausencia de vinculo via
    // FK, seguranca suficiente; gatear por eh_teste quebraria o uso legitimo
    // de excluir um cadastro real sem vinculo.
    if (action === 'veiculo_excluir') {
      ensurePodeExcluirVeiculo(moduleRole);
      const veiculoId = String(body.veiculo_id || '');
      if (!veiculoId) return json({ error: 'veiculo_id e obrigatorio.' }, 400);

      await sql.begin(async (trx) => {
        await trx.unsafe(`delete from ${SERVICOS_SCHEMA}.checklist_avaliacoes where veiculo_id = $1;`, [veiculoId]);
        await trx.unsafe(`delete from gestao_crm.veiculos_estoque where veiculo_id = $1;`, [veiculoId]);
        const rows = await trx.unsafe(`delete from public.veiculos where id = $1 returning id;`, [veiculoId]);
        if (!rows[0]) {
          throw Object.assign(new Error('Veiculo nao encontrado.'), { status: 404 });
        }
      });

      return json({ success: true });
    }

    // Exclusao definitiva de um checklist isolado (sem mexer no veiculo) -- restrita a admin e
    // a checklists marcados como eh_teste na criacao (ver checklist_iniciar acima), mesmo padrao
    // de deletar_solicitacao no Financeiro (servicos-api/index.ts). checklist_itens/
    // checklist_avarias/checklist_fotos/historico_checklist tem "on delete cascade" pra
    // avaliacao_id/checklist_id, entao deletar a linha ja limpa as tabelas filhas -- so as fotos
    // no Storage precisam ser removidas manualmente.
    if (action === 'checklist_excluir') {
      ensurePodeExcluirChecklist(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'id e obrigatorio.' }, 400);

      const existingRows = await sql.unsafe(
        `select eh_teste from ${SERVICOS_SCHEMA}.checklist_avaliacoes where id = $1 limit 1;`,
        [id],
      );
      if (!existingRows[0]) return json({ error: 'Checklist nao encontrado.' }, 404);
      if (existingRows[0].eh_teste !== true) {
        throw Object.assign(new Error('Somente checklists marcados como teste podem ser excluidos.'), { status: 400 });
      }

      const fotos = await sql.unsafe(
        `select storage_path from ${SERVICOS_SCHEMA}.checklist_fotos where avaliacao_id = $1 and storage_path is not null;`,
        [id],
      );

      await sql.unsafe(`delete from ${SERVICOS_SCHEMA}.checklist_avaliacoes where id = $1;`, [id]);

      const storageClient = createStorageAdminClient();
      if (storageClient && fotos.length > 0) {
        const paths = fotos.map((f: { storage_path: unknown }) => String(f.storage_path));
        const { error } = await storageClient.storage.from(FOTOS_STORAGE_BUCKET).remove(paths);
        if (error) console.error('Falha ao remover fotos do storage:', { paths, message: error.message });
      }

      return json({ success: true });
    }

    if (action === 'unidades_listar') {
      const rows = await sql.unsafe(`
        select u.id, u.nome, u.empresa_id
        from public.unidades u
        left join public.empresas e on e.id = u.empresa_id
        where e.slug is distinct from 'macom_motos'
        order by u.nome;
      `);
      return json({ rows });
    }

    if (action === 'cores_listar') {
      const rows = await sql.unsafe(`select id, nome from public.cores_veiculo order by nome;`);
      return json({ rows });
    }

    if (action === 'cores_criar') {
      ensurePodeEditar(moduleRole);
      const nome = upperOrNull(body.nome);
      if (!nome) return json({ error: 'nome obrigatorio.' }, 400);

      // Cores antigas foram cadastradas em caixa mista ("Branco"); reaproveita em vez de
      // duplicar como "BRANCO".
      const existente = await sql.unsafe(
        `select id, nome from public.cores_veiculo where upper(nome) = $1 limit 1;`,
        [nome],
      );
      if (existente[0]) return json({ row: existente[0] }, 200);

      const rows = await sql.unsafe(
        `
          insert into public.cores_veiculo (nome) values ($1)
          on conflict (nome) do update set nome = excluded.nome
          returning id, nome;
        `,
        [nome],
      );

      return json({ row: rows[0] }, 201);
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const corsOnlyHeaders = buildCorsHeaders(request);
    return jsonResponse({ error: getErrorMessage(error) }, getErrorStatus(error), corsOnlyHeaders);
  }
});
