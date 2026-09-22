// Edge function do modulo Oficina (sistema Servicos): Checklist Digital de
// Inspecao de Veiculos. Function separada de servicos-api (que hoje so tem o
// Financeiro) de proposito -- um bug aqui nunca derruba o deploy do
// Financeiro, ja em producao. Ver apps/servicos/CLAUDE.md para o raciocinio
// completo dessa decisao e a divida tecnica de auth compartilhada.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { getServicosAuthContext } from '../_shared/servicos-auth.ts';

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

      return json(dados);
    }

    if (action === 'checklist_iniciar') {
      ensurePodeEditar(moduleRole);

      const veiculoId = String(body.veiculo_id || '');
      if (!veiculoId) return json({ error: 'veiculo_id obrigatorio.' }, 400);

      const clienteId = body.cliente_id ? String(body.cliente_id) : null;
      const colaboradorId = body.colaborador_id ? String(body.colaborador_id) : String(collaborator!.id);
      const os = body.os ? String(body.os).trim() : null;
      const km = body.km != null ? Number(body.km) : null;
      // Unidade parte da unidade do colaborador que esta criando o checklist,
      // mas pode ser trocada na tela (ex.: inspetor cobrindo outra unidade) --
      // ela define quem enxerga o checklist depois, ver ensureUnidadeAcessivel.
      const unidadeId = body.unidade_id ? String(body.unidade_id) : collaborator?.unidade_id ? String(collaborator.unidade_id) : null;

      let avisoDonoDiferente = null;
      if (clienteId) {
        const veiculoRows = await sql.unsafe(
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

      const rows = await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.checklist_avaliacoes
            (veiculo_id, cliente_id, colaborador_id, os, km, unidade_id)
          values ($1, $2, $3, $4, $5, $6)
          returning *;
        `,
        [veiculoId, clienteId, colaboradorId, os, km, unidadeId],
      );

      return json({ row: rows[0], aviso_dono_diferente: avisoDonoDiferente }, 201);
    }

    if (action === 'checklist_atualizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id, moduleRole, collaborator);

      const campos: Record<string, unknown> = {};
      if (body.km != null) campos.km = Number(body.km);
      if (body.nivel_combustivel != null) campos.nivel_combustivel = Number(body.nivel_combustivel);
      if (body.pintura_suja != null) campos.pintura_suja = Boolean(body.pintura_suja);
      if (body.observacoes !== undefined) campos.observacoes = body.observacoes ? String(body.observacoes) : null;
      if (body.os !== undefined) campos.os = body.os ? String(body.os) : null;
      if (body.comunicacoes !== undefined) {
        campos.comunicacoes = JSON.stringify(Array.isArray(body.comunicacoes) ? body.comunicacoes : []);
      }
      if (body.assinatura_entrada !== undefined) {
        campos.assinatura_entrada = body.assinatura_entrada ? String(body.assinatura_entrada) : null;
      }
      if (body.unidade_id !== undefined) {
        campos.unidade_id = body.unidade_id ? String(body.unidade_id) : null;
      }

      const fields = Object.keys(campos);
      if (!fields.length) return json({ error: 'Nada para atualizar.' }, 400);

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

      return json({ row: rows[0] });
    }

    if (action === 'checklist_finalizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id, moduleRole, collaborator);

      const entregaObservacoes = body.entrega_observacoes ? String(body.entrega_observacoes) : null;
      const assinaturaSaida = body.assinatura_saida ? String(body.assinatura_saida) : null;
      const entregaConferida = Boolean(body.entrega_conferida);

      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_avaliacoes
          set status = 'finalizado',
            data_saida = now(),
            entrega_conferida = $2,
            entrega_observacoes = $3,
            assinatura_saida = coalesce($4, assinatura_saida)
          where id = $1
          returning *;
        `,
        [id, entregaConferida, entregaObservacoes, assinaturaSaida],
      );

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
        [avaliacaoId, tipo, posX, posY, body.area ? String(body.area) : null, body.observacao ? String(body.observacao) : null],
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

      const rows = await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.checklist_fotos (avaliacao_id, storage_path, categoria, legenda)
          values ($1, $2, $3, $4)
          returning *;
        `,
        [avaliacaoId, storagePath, body.categoria ? String(body.categoria) : null, body.legenda ? String(body.legenda) : null],
      );

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
        [avaliacaoId, storagePath, body.categoria ? String(body.categoria) : null, body.legenda ? String(body.legenda) : null],
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

      return json({ row: rows[0] || null });
    }

    if (action === 'cliente_buscar') {
      const busca = String(body.busca || '').trim();
      if (!busca) return json({ rows: [] });

      const rows = await sql.unsafe(
        `
          select id, nome, telefone, email, cpf_cnpj
          from public.clientes
          where nome ilike $1 or telefone ilike $1 or cpf_cnpj ilike $1
          order by nome
          limit 20;
        `,
        [`%${busca}%`],
      );

      return json({ rows });
    }

    if (action === 'cliente_criar') {
      ensurePodeEditar(moduleRole);
      const nome = String(body.nome || '').trim();
      const telefone = String(body.telefone || '').trim();
      if (!nome || !telefone) return json({ error: 'nome e telefone sao obrigatorios.' }, 400);

      const telefoneNormalizado = telefone.replace(/\D/g, '');
      const email = body.email ? String(body.email).trim() : null;
      const emailNormalizado = email ? email.toLowerCase() : null;
      const cpfCnpj = body.cpf_cnpj ? String(body.cpf_cnpj).trim() : null;
      const cpfCnpjNormalizado = cpfCnpj ? cpfCnpj.replace(/\D/g, '') : null;

      const rows = await sql.unsafe(
        `
          insert into public.clientes
            (nome, telefone, telefone_normalizado, email, email_normalizado, cpf_cnpj, cpf_cnpj_normalizado)
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id, nome, telefone, email, cpf_cnpj;
        `,
        [nome, telefone, telefoneNormalizado, email, emailNormalizado, cpfCnpj, cpfCnpjNormalizado],
      );

      return json({ row: rows[0] }, 201);
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
            v.id, v.placa, v.chassi, cv.nome as cor, v.km,
            mv.nome as modelo_nome, ma.nome as marca_nome,
            v.cliente_atual_id, c.nome as cliente_atual_nome,
            (select count(*) from gestao_servicos.checklist_avaliacoes ca where ca.veiculo_id = v.id) as total_checklists
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
            v.id, v.placa, v.chassi, cv.nome as cor, v.km,
            mv.nome as modelo_nome, ma.nome as marca_nome,
            v.cliente_atual_id, c.nome as cliente_atual_nome,
            ve.id as estoque_id, ve.status as estoque_status
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
      const observacoes = body.observacoes ? String(body.observacoes) : null;

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

      const rows = await sql.unsafe(
        `
          insert into public.veiculos (modelo_id, versao_id, chassi, placa, cor_id, km)
          values ($1, $2, $3, $4, $5, $6)
          returning id, placa, chassi, cor_id, km;
        `,
        [
          modeloId,
          body.versao_id ? String(body.versao_id) : null,
          chassi,
          placa,
          body.cor_id ? String(body.cor_id) : null,
          body.km != null ? Number(body.km) : null,
        ],
      );

      return json({ row: rows[0] }, 201);
    }

    if (action === 'unidades_listar') {
      const rows = await sql.unsafe(`select id, nome, empresa_id from public.unidades order by nome;`);
      return json({ rows });
    }

    if (action === 'cores_listar') {
      const rows = await sql.unsafe(`select id, nome from public.cores_veiculo order by nome;`);
      return json({ rows });
    }

    if (action === 'cores_criar') {
      ensurePodeEditar(moduleRole);
      const nome = String(body.nome || '').trim();
      if (!nome) return json({ error: 'nome obrigatorio.' }, 400);

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
