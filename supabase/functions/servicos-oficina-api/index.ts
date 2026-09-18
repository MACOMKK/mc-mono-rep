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

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
  return message;
}

function podeVer(moduleRole: string | null) {
  return Boolean(moduleRole) && moduleRole !== 'nenhum';
}

function podeEditar(moduleRole: string | null) {
  return moduleRole === 'inspetor' || moduleRole === 'gestor' || moduleRole === 'admin';
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

async function getAvaliacao(id: string) {
  const rows = await sql!.unsafe(
    `select * from ${SERVICOS_SCHEMA}.checklist_avaliacoes where id = $1 limit 1;`,
    [id],
  );
  const row = rows[0];
  if (!row) throw Object.assign(new Error('Checklist nao encontrado.'), { status: 404 });
  return row;
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

    const { collaborator, moduleRole } = await getServicosAuthContext(
      request,
      sql,
      supabaseUrl,
      supabaseAnonKey,
      MODULO,
    );

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'checklist_listar');

    if (action === 'me') {
      return json({ role: moduleRole, collaborator_id: collaborator?.id || null });
    }

    ensurePodeVer(moduleRole);

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

      const rows = await sql.unsafe(
        `
          select ca.*, cl.nome as cliente_nome, cl.telefone as cliente_telefone,
            v.placa as veiculo_placa, v.chassi as veiculo_chassi, v.cor as veiculo_cor,
            mv.nome as veiculo_modelo, c.nome as colaborador_nome, c.assinatura_url as colaborador_assinatura_url
          from ${SERVICOS_SCHEMA}.checklist_avaliacoes ca
          left join public.clientes cl on cl.id = ca.cliente_id
          left join public.veiculos v on v.id = ca.veiculo_id
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.colaboradores c on c.id = ca.colaborador_id
          where ca.id = $1
          limit 1;
        `,
        [id],
      );
      const row = rows[0];
      if (!row) return json({ error: 'Checklist nao encontrado.' }, 404);

      const itens = await sql.unsafe(
        `select * from ${SERVICOS_SCHEMA}.checklist_itens where avaliacao_id = $1 order by categoria, criado_em;`,
        [id],
      );
      const avarias = await sql.unsafe(
        `select * from ${SERVICOS_SCHEMA}.checklist_avarias where avaliacao_id = $1 order by criado_em;`,
        [id],
      );

      const fotos = await sql.unsafe(
        `select * from ${SERVICOS_SCHEMA}.checklist_fotos where avaliacao_id = $1 order by criado_em;`,
        [id],
      );
      const fotosComUrl = await Promise.all(
        fotos.map(async (foto: Record<string, unknown>) => ({
          ...foto,
          url: await createFotoSignedUrl(String(foto.storage_path || '')),
        })),
      );

      return json({ row: { ...row, fotos: fotosComUrl }, itens, avarias });
    }

    if (action === 'checklist_iniciar') {
      ensurePodeEditar(moduleRole);

      const veiculoId = String(body.veiculo_id || '');
      if (!veiculoId) return json({ error: 'veiculo_id obrigatorio.' }, 400);

      const clienteId = body.cliente_id ? String(body.cliente_id) : null;
      const colaboradorId = body.colaborador_id ? String(body.colaborador_id) : String(collaborator!.id);
      const os = body.os ? String(body.os).trim() : null;
      const km = body.km != null ? Number(body.km) : null;

      const rows = await sql.unsafe(
        `
          insert into ${SERVICOS_SCHEMA}.checklist_avaliacoes
            (veiculo_id, cliente_id, colaborador_id, os, km)
          values ($1, $2, $3, $4, $5)
          returning *;
        `,
        [veiculoId, clienteId, colaboradorId, os, km],
      );

      return json({ row: rows[0] }, 201);
    }

    if (action === 'checklist_atualizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id);

      const campos: Record<string, unknown> = {};
      if (body.km != null) campos.km = Number(body.km);
      if (body.nivel_combustivel != null) campos.nivel_combustivel = Number(body.nivel_combustivel);
      if (body.pintura_suja != null) campos.pintura_suja = Boolean(body.pintura_suja);
      if (body.observacoes !== undefined) campos.observacoes = body.observacoes ? String(body.observacoes) : null;
      if (body.os !== undefined) campos.os = body.os ? String(body.os) : null;

      const fields = Object.keys(campos);
      if (!fields.length) return json({ error: 'Nada para atualizar.' }, 400);

      const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
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

    if (action === 'checklist_finalizar') {
      ensurePodeEditar(moduleRole);
      const id = String(body.id || '');
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await getAvaliacao(id);

      const entregaObservacoes = body.entrega_observacoes ? String(body.entrega_observacoes) : null;
      const assinaturaCliente = body.assinatura_cliente ? String(body.assinatura_cliente) : null;
      const entregaConferida = Boolean(body.entrega_conferida);

      const rows = await sql.unsafe(
        `
          update ${SERVICOS_SCHEMA}.checklist_avaliacoes
          set status = 'finalizado',
            data_saida = now(),
            entrega_conferida = $2,
            entrega_observacoes = $3,
            assinatura_cliente = coalesce($4, assinatura_cliente)
          where id = $1
          returning *;
        `,
        [id, entregaConferida, entregaObservacoes, assinaturaCliente],
      );

      return json({ row: rows[0] });
    }

    if (action === 'checklist_itens_upsert') {
      ensurePodeEditar(moduleRole);
      const avaliacaoId = String(body.avaliacao_id || '');
      if (!avaliacaoId) return json({ error: 'avaliacao_id obrigatorio.' }, 400);
      await getAvaliacao(avaliacaoId);

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
      await getAvaliacao(avaliacaoId);

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
      await getAvaliacao(avaliacaoId);

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
      await getAvaliacao(avaliacaoId);

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
      await getAvaliacao(avaliacaoId);

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
          select v.id, v.placa, v.chassi, v.cor, v.km, mv.nome as modelo_nome, ma.nome as marca_nome
          from public.veiculos v
          left join public.modelos_veiculo mv on mv.id = v.modelo_id
          left join public.marcas_veiculo ma on ma.id = mv.marca_id
          where v.placa ilike $1 or v.chassi ilike $1
          order by v.placa
          limit 20;
        `,
        [`%${busca}%`],
      );

      return json({ rows });
    }

    if (action === 'veiculo_criar') {
      ensurePodeEditar(moduleRole);
      const modeloId = String(body.modelo_id || '');
      const chassi = String(body.chassi || '').trim().toUpperCase();
      if (!modeloId || !chassi) return json({ error: 'modelo_id e chassi sao obrigatorios.' }, 400);

      const placa = body.placa ? String(body.placa).trim().toUpperCase().replace(/\s+/g, '') : null;

      const rows = await sql.unsafe(
        `
          insert into public.veiculos (modelo_id, versao_id, chassi, placa, cor, km)
          values ($1, $2, $3, $4, $5, $6)
          returning id, placa, chassi, cor, km;
        `,
        [
          modeloId,
          body.versao_id ? String(body.versao_id) : null,
          chassi,
          placa,
          body.cor ? String(body.cor).trim() : null,
          body.km != null ? Number(body.km) : null,
        ],
      );

      return json({ row: rows[0] }, 201);
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const corsOnlyHeaders = buildCorsHeaders(request);
    return jsonResponse({ error: getErrorMessage(error) }, getErrorStatus(error), corsOnlyHeaders);
  }
});
