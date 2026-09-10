import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';
import {
  CRM_SCHEMA,
  buildAccessScope,
  getAccessLevel,
  applyCreateScope,
  ensureCanManage,
  ensureCanConfigure,
} from './access-scope.ts';
import type { EntityName } from './access-scope.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { CLEAR_MUST_CHANGE_PASSWORD_SQL, mapMustChangePassword } from '../_shared/auth.ts';

const CRM_SYSTEM_SLUG = 'crm';

const ENTITY_CONFIG = {
  clientes: {
    table: 'clientes',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'nome',
      'telefone',
      'telefone_normalizado',
      'email',
      'email_normalizado',
      'empresa',
      'status_relacionamento',
      'observacoes',
    ],
  },
  leads: {
    table: 'leads',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'cliente_id',
      'nome',
      'telefone',
      'telefone_normalizado',
      'email',
      'email_normalizado',
      'origem_id',
      'status',
      'modelo_interesse',
      'empresa',
      'convertido_em',
      'perdido_em',
      'motivo_perda',
      'responsavel_id',
      'unidade_id',
      'primeiro_contato_em',
      'sla_primeiro_contato_em',
      'previsao_fechamento',
      'observacoes',
    ],
  },
  atendimentos: {
    table: 'atendimentos',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'lead_id',
      'cliente_id',
      'titulo',
      'status',
      'tipo_atendimento',
      'temperatura',
      'proximo_contato',
      'observacoes',
      'resultado',
      'motivo_resultado',
      'concluido_em',
    ],
  },
  historico_atendimentos: {
    table: 'historico_atendimentos',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'cliente_id',
      'lead_id',
      'atendimento_id',
      'tipo',
      'descricao',
      'entidade',
      'entidade_id',
      'status',
      'metadados',
    ],
  },
  veiculos_interesse: {
    table: 'veiculos_interesse',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'lead_id',
      'marca',
      'modelo',
      'marca_id',
      'modelo_id',
      'marca_outro',
      'modelo_outro',
      'versao_id',
      'versao_outro',
      'versao',
      'ano',
      'categoria_veiculo_id',
      'condicao',
      'faixa_preco_min',
      'faixa_preco_max',
      'cor_preferida',
      'combustivel',
      'cambio',
      'atributos',
      'principal',
      'observacoes',
    ],
  },
  categorias_veiculo: {
    table: 'categorias_veiculo',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['nome', 'ativo', 'campos_extra'],
  },
  origens_lead: {
    table: 'origens_lead',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['nome', 'ativo'],
  },
  marcas_veiculo: {
    table: 'marcas_veiculo',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['nome', 'ativo'],
  },
  modelos_veiculo: {
    table: 'modelos_veiculo',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['marca_id', 'categoria_veiculo_id', 'nome', 'ativo', 'ano_inicio', 'ano_fim'],
  },
  versoes_veiculo: {
    table: 'versoes_veiculo',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['modelo_id', 'nome', 'ativo'],
  },
  veiculos_estoque: {
    table: 'veiculos_estoque',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'modelo_id',
      'versao_id',
      'modelo_outro',
      'versao_outro',
      'chassi',
      'placa',
      'cor',
      'km',
      'condicao',
      'status',
      'preco',
      'observacoes',
    ],
  },
} as const;


const ORDER_FIELD_MAP: Record<string, string> = {
  created_date: 'criado_em',
  updated_date: 'atualizado_em',
  tipo_evento: 'tipo_atendimento',
};

const databaseUrl = Deno.env.get('DATABASE_URL');
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

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

function validationError(message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  return error;
}

function validateContactFields(entity: EntityName, payload: Record<string, unknown>) {
  if (entity !== 'clientes' && entity !== 'leads') return;

  if (typeof payload.nome === 'string') {
    const parts = payload.nome.trim().replace(/\s+/g, ' ').split(' ').filter((part) => part.length >= 2);
    if (parts.length < 2) {
      throw validationError('Nome deve ter nome e sobrenome.');
    }
  }

  if (typeof payload.telefone === 'string') {
    const digits = payload.telefone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      throw validationError('Telefone invalido. Informe DDD + numero (10 ou 11 digitos).');
    }
    payload.telefone = digits;
    payload.telefone_normalizado = digits;
  }

  if (typeof payload.email === 'string' && payload.email.trim()) {
    const email = payload.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw validationError('E-mail invalido. Informe um e-mail no formato nome@dominio.com.');
    }
    payload.email = email;
    payload.email_normalizado = email.toLowerCase();
  }
}

function mapDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('idx_crm_leads_cliente_ativo_unique')) {
    return 'Ja existe um lead ativo para este cliente.';
  }

  if (message.includes('idx_crm_atendimentos_lead_aberto_unique')) {
    return 'Este lead ja possui uma atividade planejada.';
  }

  if (message.includes('idx_crm_atendimentos_lead_planejada_unique')) {
    return 'Este lead ja possui uma atividade planejada.';
  }

  if (message.includes('idx_crm_clientes_telefone_unique')) {
    return 'Ja existe outro cliente com este telefone.';
  }

  if (message.includes('idx_crm_clientes_email_unique')) {
    return 'Ja existe outro cliente com este e-mail.';
  }

  if (message.includes('categorias_veiculo_nome_key')) {
    return 'Ja existe uma categoria com este nome.';
  }

  if (message.includes('origens_lead_nome_key')) {
    return 'Ja existe uma origem com este nome.';
  }

  if (message.includes('marcas_veiculo_nome_key')) {
    return 'Ja existe uma marca com este nome.';
  }

  if (message.includes('modelos_veiculo_marca_id_categoria_veiculo_id_nome_key')) {
    return 'Ja existe um modelo com este nome para esta marca e segmento.';
  }

  if (message.includes('modelos_veiculo_ano_check')) {
    return 'O ano final deve ser maior ou igual ao ano inicial.';
  }

  if (message.includes('versoes_veiculo_modelo_id_nome_key')) {
    return 'Ja existe uma versao com este nome para este modelo.';
  }

  if (message.includes('veiculos_estoque_chassi_key')) {
    return 'Ja existe um veiculo em estoque com este chassi.';
  }

  if (message.includes('null value in column "categoria_veiculo_id"')) {
    return 'Selecione o segmento (categoria) do veiculo.';
  }

  if (message.includes('null value in column "origem_id"')) {
    return 'Selecione a origem do lead.';
  }

  if (message.includes('Motivo da perda e obrigatorio')) {
    return 'Informe o motivo da perda para encerrar este lead.';
  }

  if (message.includes('Informe o resultado para concluir')) {
    return 'Informe o resultado para concluir a atividade.';
  }

  if (message.includes('Informe o motivo da perda para concluir')) {
    return 'Informe o motivo da perda para concluir a atividade.';
  }

  if (message.includes('Atividade encerrada nao pode ser reaberta')) {
    return 'Atividade encerrada nao pode ser reaberta.';
  }

  if (message.includes('Responsavel deve possuir acesso')) {
    return 'O vendedor selecionado nao pertence a unidade do lead ou nao possui acesso ao CRM.';
  }

  if (message.includes('Nenhum vendedor elegivel')) {
    return 'Nenhum vendedor desta unidade esta disponivel para receber o lead.';
  }

  if (message.includes('Todos os vendedores ativos desta unidade atingiram o limite')) {
    return 'Todos os vendedores ativos desta unidade ja atingiram o limite de leads ativos. Aumente o limite, adicione outro vendedor ou atribua o lead manualmente.';
  }

  if (message.includes('Nenhum vendedor ativo nesta unidade')) {
    return 'Nenhum vendedor esta ativo na distribuicao automatica desta unidade. Ative ao menos um vendedor na configuracao de distribuicao ou atribua o lead manualmente.';
  }

  if (message.includes('Unidade do lead e obrigatoria')) {
    return 'Selecione a unidade responsavel pelo lead.';
  }

  return message || 'Falha ao consultar o CRM.';
}

function getErrorStatus(error: unknown) {
  const status = Number((error as { status?: number })?.status);
  if (Number.isFinite(status) && status >= 400) return status;
  return 500;
}

function sanitizePayload(entity: EntityName, payload: Record<string, unknown> = {}) {
  const allowedFields = ENTITY_CONFIG[entity].allowedFields;
  const sanitized: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in payload) {
      sanitized[field] = payload[field];
    }
  }

  return sanitized;
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildSqlFilters(filters: Record<string, unknown> = {}, startIndex = 1, tableAlias?: string) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const reservedFilters = new Set([
    'created_from',
    'created_to',
    'previsao_from',
    'previsao_to',
    'proximo_from',
    'proximo_to',
    'sla_status',
  ]);

  for (const [field, value] of Object.entries(filters)) {
    if (reservedFilters.has(field)) continue;
    if (value === undefined || value === null || value === '' || field.includes('.')) continue;
    if (value === '__NULL__') {
      clauses.push(`${prefix}${quoteIdentifier(field)} is null`);
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.length) continue;
      const placeholders = value.map((_, index) => `$${startIndex + values.length + index}`).join(', ');
      clauses.push(`${prefix}${quoteIdentifier(field)} in (${placeholders})`);
      values.push(...value);
      continue;
    }
    clauses.push(`${prefix}${quoteIdentifier(field)} = $${startIndex + values.length}`);
    values.push(value);
  }

  return { clauses, values };
}

function parseOrFilter(orFilter: string | undefined, startIndex: number, tableAlias?: string) {
  if (!orFilter) return { clause: '', values: [] as unknown[] };

  const values: unknown[] = [];
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const clauses = orFilter
    .split(',')
    .map((part) => {
      const match = part.match(/^([a-zA-Z0-9_]+)\.eq\.(.*)$/);
      if (!match) return null;
      values.push(match[2]);
      return `${prefix}${quoteIdentifier(match[1])} = $${startIndex + values.length - 1}`;
    })
    .filter(Boolean);

  return {
    clause: clauses.length ? `(${clauses.join(' or ')})` : '',
    values,
  };
}

function parseInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function appendDateRangeFilter(
  clauses: string[],
  values: unknown[],
  column: string,
  fromValue: unknown,
  toValue: unknown,
  startIndex = 1,
) {
  if (fromValue) {
    values.push(fromValue);
    clauses.push(`${column} >= $${startIndex + values.length - 1}`);
  }
  if (toValue) {
    values.push(toValue);
    clauses.push(`${column} <= $${startIndex + values.length - 1}`);
  }
}

function buildSearchFilter(entity: EntityName, search: string, startIndex: number) {
  const term = search.trim();
  if (!term) return { clause: '', values: [] as unknown[] };

  const normalizedTerm = `%${term.toLowerCase()}%`;
  const digits = term.replace(/\D/g, '');
  const values: unknown[] = [];
  const parts: string[] = [];
  const pushText = (expression: string) => {
    values.push(normalizedTerm);
    parts.push(`lower(coalesce(${expression}, '')) like $${startIndex + values.length - 1}`);
  };
  const pushPhone = (expression: string) => {
    if (!digits) return;
    values.push(`%${digits}%`);
    parts.push(`coalesce(${expression}, '') like $${startIndex + values.length - 1}`);
  };

  if (entity === 'leads') {
    pushText('l.nome');
    pushText('l.email');
    pushText('l.modelo_interesse');
    pushText('o.nome');
    pushText('r.nome');
    values.push(normalizedTerm);
    parts.push(`exists (
      select 1
      from ${CRM_SCHEMA}.veiculos_interesse vi
      where vi.lead_id = l.id
        and (
          lower(coalesce(vi.marca, '')) like $${startIndex + values.length - 1}
          or lower(coalesce(vi.modelo, '')) like $${startIndex + values.length - 1}
          or lower(coalesce(vi.versao, '')) like $${startIndex + values.length - 1}
        )
    )`);
    pushPhone('l.telefone_normalizado');
  } else if (entity === 'clientes') {
    pushText('nome');
    pushText('email');
    pushText('empresa');
    pushPhone('telefone_normalizado');
    values.push(normalizedTerm);
    parts.push(`exists (
      select 1
      from ${CRM_SCHEMA}.leads l
      where l.cliente_id = clientes.id
        and lower(coalesce(l.modelo_interesse, '')) like $${startIndex + values.length - 1}
    )`);
  } else if (entity === 'atendimentos') {
    pushText('a.titulo');
    pushText('a.observacoes');
    pushText('l.nome');
    pushText('l.modelo_interesse');
    pushText('c.nome');
    pushPhone('l.telefone_normalizado');
    pushPhone('c.telefone_normalizado');
  } else if (entity === 'historico_atendimentos') {
    pushText('descricao');
    pushText('tipo');
    pushText('status');
  } else if (entity === 'veiculos_estoque') {
    pushText('chassi');
    pushText('placa');
    pushText('cor');
    pushText('modelo_outro');
    pushText('versao_outro');
  }

  return {
    clause: parts.length ? `(${parts.join(' or ')})` : '',
    values,
  };
}

function buildAdvancedFilters(entity: EntityName, filters: Record<string, unknown>, startIndex: number) {
  const clauses: string[] = [];
  const values: unknown[] = [];

  appendDateRangeFilter(
    clauses,
    values,
    scopedColumn(entity, 'criado_em'),
    filters.created_from,
    filters.created_to,
    startIndex,
  );

  if (entity === 'leads') {
    appendDateRangeFilter(clauses, values, 'l."previsao_fechamento"', filters.previsao_from, filters.previsao_to, startIndex);
    if (filters.sla_status === 'atrasado') {
      clauses.push(`l."primeiro_contato_em" is null and l."sla_primeiro_contato_em" < now()`);
    } else if (filters.sla_status === 'alerta') {
      clauses.push(`l."primeiro_contato_em" is null and l."sla_primeiro_contato_em" >= now() and l."sla_primeiro_contato_em" <= now() + (coalesce(cd."sla_alerta_minutos", 10) * interval '1 minute')`);
    } else if (filters.sla_status === 'no_prazo') {
      clauses.push(`l."primeiro_contato_em" is null and (l."sla_primeiro_contato_em" is null or l."sla_primeiro_contato_em" > now() + (coalesce(cd."sla_alerta_minutos", 10) * interval '1 minute'))`);
    } else if (filters.sla_status === 'concluido') {
      clauses.push(`l."primeiro_contato_em" is not null`);
    }
  }

  if (entity === 'atendimentos') {
    appendDateRangeFilter(clauses, values, 'a."proximo_contato"', filters.proximo_from, filters.proximo_to, startIndex);
    if (filters.empresa) {
      values.push(filters.empresa);
      clauses.push(`(l."empresa" = $${startIndex + values.length - 1} or c."empresa" = $${startIndex + values.length - 1})`);
    }
    if (filters.origem_id) {
      values.push(filters.origem_id);
      clauses.push(`l."origem_id" = $${startIndex + values.length - 1}`);
    }
    if (filters.responsavel_id) {
      values.push(filters.responsavel_id);
      clauses.push(`l."responsavel_id" = $${startIndex + values.length - 1}`);
    }
  }

  return { clauses, values };
}

async function ensureEntityAccess(
  entity: EntityName,
  id: string,
  access: Record<string, unknown> | null,
  collaborator: Record<string, unknown> | null,
) {
  const scope = buildAccessScope(entity, access, collaborator, 2);
  const whereScope = scope.clause ? `and ${scope.clause}` : '';
  const rows = await sql.unsafe(
    `${buildListSelect(entity)} where ${scopedColumn(entity, 'id')} = $1 ${whereScope} limit 1;`,
    [id, ...scope.values],
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Registro nao encontrado ou sem permissao.'), { status: 403 });
  }
  return rows[0];
}

// Checagem de autorizacao mais leve para escrita correlata (ex.: create/update de
// atendimentos/veiculos_interesse que precisam validar um lead_id) — evita rodar o
// select com todos os joins de buildListSelect('leads') so para autorizar, ja que
// esses joins so sao necessarios para exibicao em listagem.
async function ensureLeadAccessLight(
  id: string,
  access: Record<string, unknown> | null,
  collaborator: Record<string, unknown> | null,
) {
  const scope = buildAccessScope('leads', access, collaborator, 2);
  const whereScope = scope.clause ? `and ${scope.clause}` : '';
  const rows = await sql.unsafe(
    `select l.id, l.cliente_id, l.status, l.responsavel_id, l.unidade_id from ${CRM_SCHEMA}.leads l where l.id = $1 ${whereScope} limit 1;`,
    [id, ...scope.values],
  );

  if (!rows[0]) {
    throw Object.assign(new Error('Registro nao encontrado ou sem permissao.'), { status: 403 });
  }
  return rows[0];
}

function buildInsertQuery(schema: string, table: string, payload: Record<string, unknown>) {
  const fields = Object.keys(payload);
  const columns = fields.map(quoteIdentifier).join(', ');
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');
  return {
    text: `insert into ${schema}.${table} (${columns}) values (${placeholders}) returning *;`,
    values: fields.map((field) => payload[field]),
  };
}

function buildUpdateQuery(schema: string, table: string, id: string, payload: Record<string, unknown>) {
  const fields = Object.keys(payload);
  const assignments = fields.map((field, index) => `${quoteIdentifier(field)} = $${index + 2}`).join(', ');
  return {
    text: `update ${schema}.${table} set ${assignments} where id = $1 returning *;`,
    values: [id, ...fields.map((field) => payload[field])],
  };
}

function buildListSelect(entity: EntityName, options: { withCount?: boolean } = {}) {
  const countExpr = options.withCount ? 'count(*) over() as crm_total_count, ' : '';

  if (entity === 'leads') {
    return `
      select
        ${countExpr}l.*,
        coalesce(cd.sla_alerta_minutos, 10) as sla_alerta_minutos,
        coalesce(cd.sla_primeiro_contato_minutos, 30) as sla_primeiro_contato_minutos,
        case
          when r.id is null then null
        else json_build_object(
          'id', r.id,
          'nome', r.nome,
          'email', r.email,
          'unidade_id', r.unidade_id
        )
        end as responsavel,
        o.nome as origem_nome,
        vi_principal.veiculo_interesse
      from ${CRM_SCHEMA}.leads l
      left join public.colaboradores r on r.id = l.responsavel_id
      left join ${CRM_SCHEMA}.configuracoes_distribuicao cd on cd.unidade_id = l.unidade_id
      left join ${CRM_SCHEMA}.origens_lead o on o.id = l.origem_id
      left join lateral (
        select row_to_json(vi) as veiculo_interesse
        from ${CRM_SCHEMA}.veiculos_interesse vi
        where vi.lead_id = l.id
        order by vi.principal desc, vi.criado_em asc
        limit 1
      ) vi_principal on true
    `;
  }

  if (entity !== 'atendimentos') {
    return `select ${countExpr}* from ${CRM_SCHEMA}.${ENTITY_CONFIG[entity].table}`;
  }

  return `
    select
      ${countExpr}a.*,
      row_to_json(l) as lead,
      row_to_json(c) as cliente,
      case
        when r.id is null then null
        else json_build_object(
          'id', r.id,
          'nome', r.nome,
          'email', r.email,
          'unidade_id', r.unidade_id
        )
      end as responsavel,
      lo.nome as lead_origem_nome
    from ${CRM_SCHEMA}.atendimentos a
    left join ${CRM_SCHEMA}.leads l on l.id = a.lead_id
    left join ${CRM_SCHEMA}.clientes c on c.id = a.cliente_id
    left join public.colaboradores r on r.id = l.responsavel_id
    left join ${CRM_SCHEMA}.origens_lead lo on lo.id = l.origem_id
  `;
}

function baseAlias(entity: EntityName) {
  if (entity === 'atendimentos') return 'a';
  if (entity === 'leads') return 'l';
  return '';
}

function scopedColumn(entity: EntityName, column: string) {
  const alias = baseAlias(entity);
  return alias ? `${alias}.${quoteIdentifier(column)}` : quoteIdentifier(column);
}

async function getAuthenticatedUser(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw Object.assign(new Error('Supabase nao configurado.'), { status: 500 });
  }

  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser();

  if (error || !data.user) {
    throw Object.assign(new Error('Sessao expirada. Faca login novamente.'), { status: 401 });
  }

  return data.user;
}

async function getCurrentCollaborator(user: { id: string; email?: string }) {
  const rows = await sql!.unsafe(
    `
      select *
      from public.colaboradores
      where id = $1
         or lower(email) = lower($2)
      order by case when id = $1 then 0 else 1 end
      limit 1;
    `,
    [user.id, user.email || ''],
  );

  return rows[0] || null;
}

async function getCrmAccess(collaboratorId: string) {
  const rows = await sql!.unsafe(
    `
      select
        aus.*,
        row_to_json(s) as sistema
      from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = $1
        and aus.ativo = true
        and s.slug = $2
        and s.ativo = true
      limit 1;
    `,
    [collaboratorId, CRM_SYSTEM_SLUG],
  );

  return rows[0] || null;
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

    const user = await getAuthenticatedUser(request);
    const collaborator = await getCurrentCollaborator(user);
    const access = collaborator?.id ? await getCrmAccess(String(collaborator.id)) : null;

    if (!collaborator) {
      console.warn('[crm-api] acesso negado: usuario autenticado sem colaborador vinculado', {
        userId: user.id,
        email: user.email,
      });
    } else if (!access) {
      console.warn('[crm-api] acesso negado: colaborador sem acesso ativo ao CRM', {
        userId: user.id,
        colaboradorId: collaborator.id,
        email: user.email,
      });
    }

    ensureCanManage(access);

    const body = await request.json().catch(() => ({}));
    const action = String(body.action || 'list');

    if (action === 'me') {
      return json({ row: collaborator, access, must_change_password: mapMustChangePassword(collaborator) });
    }

    if (action === 'clear_password_change_required') {
      if (!collaborator?.id) {
        return json({ error: 'Nao autenticado.', code: 'auth_required' }, 401);
      }
      await sql.unsafe(CLEAR_MUST_CHANGE_PASSWORD_SQL, [collaborator.id]);
      return json({ success: true });
    }

    if (action === 'list_responsaveis') {
      const level = getAccessLevel(access);
      const scopeUnitId = level === 'admin' ? null : (collaborator?.unidade_id || null);
      const scopeCollaboratorId = level === 'usuario' ? collaborator?.id : null;
      const rows = await sql.unsafe(
        `
          select distinct
            c.id,
            c.nome,
            c.email,
            c.unidade_id,
            u.nome as unidade_nome,
            aus.nivel_acesso,
            coalesce(vd.ativo, true) as distribuicao_ativa
          from public.colaboradores c
          join public.acessos_usuario_sistema aus
            on aus.colaborador_id = c.id
            and aus.ativo = true
          join public.sistemas s
            on s.id = aus.sistema_id
            and s.slug = $1
            and s.ativo = true
          left join public.unidades u on u.id = c.unidade_id
          left join ${CRM_SCHEMA}.vendedores_distribuicao vd
            on vd.unidade_id = c.unidade_id and vd.colaborador_id = c.id
          where c.status <> 'inativo'
            and ($2::uuid is null or c.unidade_id = $2::uuid)
            and ($3::uuid is null or c.id = $3::uuid)
          order by c.nome;
        `,
        [CRM_SYSTEM_SLUG, scopeUnitId, scopeCollaboratorId],
      );
      return json({ rows });
    }

    if (action === 'get_distribution_config') {
      ensureCanConfigure(access);
      const scopeUnitId = String(access?.nivel_acesso) === 'admin'
        ? null
        : (collaborator?.unidade_id || null);
      const units = await sql.unsafe(`
        select distinct
          u.id,
          u.nome,
          coalesce(cd.ativa, true) as ativa,
          coalesce(cd.estrategia, 'menor_carteira') as estrategia,
          cd.limite_padrao_leads_ativos,
          coalesce(cd.sla_primeiro_contato_minutos, 30) as sla_primeiro_contato_minutos,
          coalesce(cd.sla_alerta_minutos, 10) as sla_alerta_minutos
        from public.unidades u
        join public.colaboradores c on c.unidade_id = u.id and c.status <> 'inativo'
        join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id and aus.ativo = true
        join public.sistemas s on s.id = aus.sistema_id and s.slug = $1 and s.ativo = true
        left join ${CRM_SCHEMA}.configuracoes_distribuicao cd on cd.unidade_id = u.id
        where ($2::uuid is null or u.id = $2::uuid)
        order by u.nome;
      `, [CRM_SYSTEM_SLUG, scopeUnitId]);
      const sellers = await sql.unsafe(`
        select
          c.id,
          c.nome,
          c.email,
          c.unidade_id,
          coalesce(vd.ativo, true) as ativo,
          vd.limite_leads_ativos,
          vd.ultimo_lead_atribuido_em,
          count(l.id)::integer as leads_ativos
        from public.colaboradores c
        join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id and aus.ativo = true
        join public.sistemas s on s.id = aus.sistema_id and s.slug = $1 and s.ativo = true
        left join ${CRM_SCHEMA}.vendedores_distribuicao vd
          on vd.unidade_id = c.unidade_id and vd.colaborador_id = c.id
        left join ${CRM_SCHEMA}.leads l
          on l.responsavel_id = c.id
         and l.status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'proposta')
        where c.status <> 'inativo' and c.unidade_id is not null
          and ($2::uuid is null or c.unidade_id = $2::uuid)
        group by c.id, c.nome, c.email, c.unidade_id, vd.ativo,
          vd.limite_leads_ativos, vd.ultimo_lead_atribuido_em
        order by c.nome;
      `, [CRM_SYSTEM_SLUG, scopeUnitId]);
      return json({ units, sellers });
    }

    if (action === 'save_distribution_config') {
      ensureCanConfigure(access);
      const unitId = String(body.unidade_id || '');
      const strategy = String(body.estrategia || 'menor_carteira');
      const defaultLimit = body.limite_padrao_leads_ativos === null || body.limite_padrao_leads_ativos === ''
        ? null
        : Number(body.limite_padrao_leads_ativos);
      const slaFirstContactMinutes = Number(body.sla_primeiro_contato_minutos || 30);
      const slaAlertMinutes = Number(body.sla_alerta_minutos ?? 10);
      const sellers = Array.isArray(body.sellers) ? body.sellers : [];

      if (!unitId) return json({ error: 'Unidade obrigatoria.' }, 400);
      if (String(access?.nivel_acesso) === 'gestor' && String(collaborator?.unidade_id || '') !== unitId) {
        return json({ error: 'Gestores podem configurar somente a propria unidade.' }, 403);
      }
      if (!['menor_carteira', 'rodizio'].includes(strategy)) return json({ error: 'Estrategia invalida.' }, 400);
      if (defaultLimit !== null && (!Number.isInteger(defaultLimit) || defaultLimit < 1)) {
        return json({ error: 'O limite padrao deve ser um numero maior que zero.' }, 400);
      }
      if (!Number.isInteger(slaFirstContactMinutes) || slaFirstContactMinutes < 1) {
        return json({ error: 'O SLA de primeiro contato deve ser maior que zero.' }, 400);
      }
      if (!Number.isInteger(slaAlertMinutes) || slaAlertMinutes < 0) {
        return json({ error: 'O alerta de SLA deve ser zero ou maior.' }, 400);
      }

      await sql.begin(async (transaction) => {
        await transaction.unsafe(`
          insert into ${CRM_SCHEMA}.configuracoes_distribuicao
            (unidade_id, ativa, estrategia, limite_padrao_leads_ativos, sla_primeiro_contato_minutos, sla_alerta_minutos)
          values ($1, $2, $3, $4, $5, $6)
          on conflict (unidade_id) do update set
            ativa = excluded.ativa,
            estrategia = excluded.estrategia,
            limite_padrao_leads_ativos = excluded.limite_padrao_leads_ativos,
            sla_primeiro_contato_minutos = excluded.sla_primeiro_contato_minutos,
            sla_alerta_minutos = excluded.sla_alerta_minutos;
        `, [unitId, body.ativa !== false, strategy, defaultLimit, slaFirstContactMinutes, slaAlertMinutes]);

        for (const seller of sellers) {
          const collaboratorId = String(seller?.colaborador_id || '');
          const limit = seller?.limite_leads_ativos === null || seller?.limite_leads_ativos === ''
            ? null
            : Number(seller.limite_leads_ativos);
          if (!collaboratorId) continue;
          if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
            throw Object.assign(new Error('O limite individual deve ser maior que zero.'), { status: 400 });
          }
          await transaction.unsafe(`
            insert into ${CRM_SCHEMA}.vendedores_distribuicao
              (unidade_id, colaborador_id, ativo, limite_leads_ativos)
            select $1, c.id, $3, $4
            from public.colaboradores c
            where c.id = $2 and c.unidade_id = $1
            on conflict (unidade_id, colaborador_id) do update set
              ativo = excluded.ativo,
              limite_leads_ativos = excluded.limite_leads_ativos;
          `, [unitId, collaboratorId, seller.ativo !== false, limit]);
        }
      });

      return json({ success: true });
    }

    if (action === 'clear_crm_test_data') {
      if (String(access?.nivel_acesso || '') !== 'admin') {
        return json({ error: 'Apenas administradores podem limpar os dados do CRM.' }, 403);
      }

      const CLEAR_CONFIRM_PHRASE = 'LIMPAR-DADOS-CRM';
      if (String(body.confirm || '') !== CLEAR_CONFIRM_PHRASE) {
        return json({ error: 'Confirmacao ausente ou invalida para limpar os dados do CRM.' }, 400);
      }

      const scopeUnitId = typeof body.unidade_id === 'string' && body.unidade_id ? body.unidade_id : null;
      let scopeUnitName: string | null = null;

      if (scopeUnitId) {
        const [unidade] = await sql.unsafe(`select nome from public.unidades where id = $1;`, [scopeUnitId]);
        if (!unidade) return json({ error: 'Unidade nao encontrada.' }, 400);
        if (String(body.confirm_unidade_nome || '').trim() !== unidade.nome) {
          return json({ error: 'Nome da unidade nao confere para confirmar a limpeza parcial.' }, 400);
        }
        scopeUnitName = unidade.nome;
      } else if (body.confirmar_global !== true) {
        return json(
          { error: 'Confirme explicitamente que deseja limpar TODAS as unidades (confirmar_global: true).' },
          400,
        );
      }

      const counts = await sql.begin(async (transaction) => {
        const leadFilter = scopeUnitId ? `where unidade_id = $1` : '';
        const leadFilterValues = scopeUnitId ? [scopeUnitId] : [];

        const [{ count: leadsCount }] = await transaction.unsafe(
          `select count(*)::int as count from ${CRM_SCHEMA}.leads ${leadFilter};`,
          leadFilterValues,
        );
        const [{ count: atendimentosCount }] = await transaction.unsafe(
          scopeUnitId
            ? `select count(*)::int as count from ${CRM_SCHEMA}.atendimentos
               where lead_id in (select id from ${CRM_SCHEMA}.leads where unidade_id = $1);`
            : `select count(*)::int as count from ${CRM_SCHEMA}.atendimentos;`,
          leadFilterValues,
        );
        const [{ count: historicoCount }] = await transaction.unsafe(
          scopeUnitId
            ? `select count(*)::int as count from ${CRM_SCHEMA}.historico_atendimentos
               where lead_id in (select id from ${CRM_SCHEMA}.leads where unidade_id = $1);`
            : `select count(*)::int as count from ${CRM_SCHEMA}.historico_atendimentos;`,
          leadFilterValues,
        );
        const [{ count: clientesCount }] = scopeUnitId
          ? [{ count: 0 }]
          : await transaction.unsafe(`select count(*)::int as count from ${CRM_SCHEMA}.clientes;`);

        await transaction.unsafe(
          `insert into ${CRM_SCHEMA}.logs_auditoria (entidade, acao, actor_colaborador_id, actor_email, metadados)
           values ($1, $2, $3, $4, $5::jsonb);`,
          [
            'crm',
            'clear_crm_test_data',
            collaborator?.id || null,
            user.email || null,
            JSON.stringify({
              escopo: scopeUnitId ? 'unidade' : 'global',
              unidade_id: scopeUnitId,
              unidade_nome: scopeUnitName,
              clientes: clientesCount,
              leads: leadsCount,
              atendimentos: atendimentosCount,
              historico_atendimentos: historicoCount,
            }),
          ],
        );

        if (scopeUnitId) {
          await transaction.unsafe(
            `delete from ${CRM_SCHEMA}.historico_atendimentos
             where lead_id in (select id from ${CRM_SCHEMA}.leads where unidade_id = $1);`,
            [scopeUnitId],
          );
          await transaction.unsafe(
            `delete from ${CRM_SCHEMA}.atendimentos
             where lead_id in (select id from ${CRM_SCHEMA}.leads where unidade_id = $1);`,
            [scopeUnitId],
          );
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.leads where unidade_id = $1;`, [scopeUnitId]);
          await transaction.unsafe(
            `update ${CRM_SCHEMA}.vendedores_distribuicao
             set ultimo_lead_atribuido_em = null
             where unidade_id = $1;`,
            [scopeUnitId],
          );
        } else {
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.historico_atendimentos;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.atendimentos;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.leads;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.clientes;`);
          await transaction.unsafe(`
            update ${CRM_SCHEMA}.vendedores_distribuicao
            set ultimo_lead_atribuido_em = null;
          `);
        }

        return { clientesCount, leadsCount, atendimentosCount, historicoCount };
      });

      console.log('[crm-api] clear_crm_test_data executado', {
        actor: user.email,
        collaboratorId: collaborator?.id,
        escopo: scopeUnitId ? 'unidade' : 'global',
        unidadeId: scopeUnitId,
        counts,
      });

      return json({
        success: true,
        scope: scopeUnitId ? 'unidade' : 'global',
        clientesPreservados: Boolean(scopeUnitId),
      });
    }

    // Acoes compostas: agrupam em uma unica invocacao (e uma unica checagem de
    // auth/acesso, ja feita acima) o que antes exigia varias chamadas HTTP
    // sequenciais do client (cada uma pagando seu proprio round-trip de auth).
    if (action === 'save_lead_full') {
      const leadId = typeof body.leadId === 'string' && body.leadId ? body.leadId : '';
      const clientePayloadRaw = sanitizePayload('clientes', body.clientePayload || {});
      validateContactFields('clientes', clientePayloadRaw);
      const leadPayloadRaw = sanitizePayload('leads', body.leadPayload || {});
      validateContactFields('leads', leadPayloadRaw);

      if (leadId) {
        await ensureEntityAccess('leads', leadId, access, collaborator);
      }

      const result = await sql.begin(async (transaction) => {
        const phone = String(clientePayloadRaw.telefone_normalizado || '');
        const email = String(clientePayloadRaw.email_normalizado || '');
        const existingClienteRows = phone
          ? await transaction.unsafe(
              `select * from ${CRM_SCHEMA}.clientes where telefone_normalizado = $1 ${email ? 'or email_normalizado = $2' : ''} limit 1;`,
              email ? [phone, email] : [phone],
            )
          : [];

        let cliente;
        if (existingClienteRows[0]) {
          const mergedCliente = applyCreateScope('clientes', {
            ...clientePayloadRaw,
            nome: clientePayloadRaw.nome || existingClienteRows[0].nome,
            email: clientePayloadRaw.email || existingClienteRows[0].email,
            email_normalizado: clientePayloadRaw.email_normalizado || existingClienteRows[0].email_normalizado,
            status_relacionamento: clientePayloadRaw.status_relacionamento || existingClienteRows[0].status_relacionamento,
          }, access, collaborator);
          const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'clientes', existingClienteRows[0].id, mergedCliente);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          cliente = rows[0];
        } else {
          const insertPayload = applyCreateScope('clientes', { ...clientePayloadRaw }, access, collaborator);
          if (collaborator?.id) insertPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'clientes', insertPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          cliente = rows[0];
        }

        const leadPayload = applyCreateScope('leads', { ...leadPayloadRaw, cliente_id: cliente.id }, access, collaborator);
        let leadRow;
        if (leadId) {
          const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'leads', leadId, leadPayload);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          leadRow = rows[0];
        } else {
          if (collaborator?.id) leadPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'leads', leadPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          leadRow = rows[0];
        }

        let vehicleRow = null;
        if (body.vehiclePayload) {
          const vehiclePayloadRaw = sanitizePayload('veiculos_interesse', {
            ...body.vehiclePayload,
            lead_id: leadRow.id,
          });
          let vehicleId = typeof body.vehicleId === 'string' && body.vehicleId ? body.vehicleId : '';
          if (!vehicleId) {
            const existingVehicle = await transaction.unsafe(
              `select id from ${CRM_SCHEMA}.veiculos_interesse where lead_id = $1 order by principal desc, criado_em asc limit 1;`,
              [leadRow.id],
            );
            vehicleId = existingVehicle[0]?.id || '';
          }
          if (vehicleId) {
            const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'veiculos_interesse', vehicleId, vehiclePayloadRaw);
            const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
            vehicleRow = rows[0];
          } else {
            const insertPayload = { ...vehiclePayloadRaw };
            if (collaborator?.id) insertPayload.criado_por = collaborator.id;
            const insertQuery = buildInsertQuery(CRM_SCHEMA, 'veiculos_interesse', insertPayload);
            const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
            vehicleRow = rows[0];
          }
        }

        if (body.historico) {
          const historicoPayload: Record<string, unknown> = {
            cliente_id: leadRow.cliente_id,
            lead_id: leadRow.id,
            atendimento_id: null,
            tipo: body.historico.tipo,
            descricao: body.historico.descricao,
            entidade: 'Lead',
            entidade_id: leadRow.id,
            status: leadRow.status,
          };
          if (collaborator?.id) historicoPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'historico_atendimentos', historicoPayload);
          await transaction.unsafe(insertQuery.text, insertQuery.values);
        }

        return { lead: leadRow, vehicle: vehicleRow };
      });

      return json(result);
    }

    if (action === 'save_evento_full') {
      const eventoId = typeof body.eventoId === 'string' && body.eventoId ? body.eventoId : '';
      const payloadRaw = sanitizePayload('atendimentos', body.payload || {});
      if (!Object.keys(payloadRaw).length) return json({ error: 'Payload vazio.' }, 400);

      if (eventoId) {
        await ensureEntityAccess('atendimentos', eventoId, access, collaborator);
      }
      if (payloadRaw.lead_id) {
        await ensureLeadAccessLight(String(payloadRaw.lead_id), access, collaborator);
      } else if (!eventoId) {
        return json({ error: 'Atividade deve estar vinculada a um lead.' }, 400);
      }

      const result = await sql.begin(async (transaction) => {
        let eventoRow;
        if (eventoId) {
          const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'atendimentos', eventoId, payloadRaw);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          eventoRow = rows[0];
        } else {
          const insertPayload = { ...payloadRaw };
          if (collaborator?.id) insertPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'atendimentos', insertPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          eventoRow = rows[0];
        }

        if (body.historico) {
          const historicoPayload: Record<string, unknown> = {
            cliente_id: eventoRow.cliente_id,
            lead_id: eventoRow.lead_id,
            atendimento_id: eventoRow.id,
            tipo: body.historico.tipo,
            descricao: body.historico.descricao,
            entidade: 'Evento',
            entidade_id: eventoRow.id,
            status: eventoRow.status,
          };
          if (collaborator?.id) historicoPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'historico_atendimentos', historicoPayload);
          await transaction.unsafe(insertQuery.text, insertQuery.values);
        }

        if (body.proximaAtividade?.payload) {
          const nextPayloadRaw = sanitizePayload('atendimentos', body.proximaAtividade.payload);
          // lead_id/cliente_id nunca vem do payload do client aqui: forcamos o mesmo lead/cliente
          // ja validado do evento principal, para nao permitir vincular a proxima atividade a um
          // lead fora do escopo do usuario.
          const insertPayload = { ...nextPayloadRaw, lead_id: eventoRow.lead_id, cliente_id: eventoRow.cliente_id };
          if (collaborator?.id) insertPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'atendimentos', insertPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          const nextEventoRow = rows[0];

          if (body.proximaAtividade.historico) {
            const nextHistoricoPayload: Record<string, unknown> = {
              cliente_id: nextEventoRow.cliente_id,
              lead_id: nextEventoRow.lead_id,
              atendimento_id: nextEventoRow.id,
              tipo: body.proximaAtividade.historico.tipo,
              descricao: body.proximaAtividade.historico.descricao,
              entidade: 'Evento',
              entidade_id: nextEventoRow.id,
              status: nextEventoRow.status,
            };
            if (collaborator?.id) nextHistoricoPayload.criado_por = collaborator.id;
            const nextInsertQuery = buildInsertQuery(CRM_SCHEMA, 'historico_atendimentos', nextHistoricoPayload);
            await transaction.unsafe(nextInsertQuery.text, nextInsertQuery.values);
          }
        }

        return { evento: eventoRow };
      });

      return json(result);
    }

    const entity = String(body.entity || '') as EntityName;
    const config = ENTITY_CONFIG[entity];

    if (!config) {
      return json({ error: 'Entidade invalida.' }, 400);
    }

    if (
      ['categorias_veiculo', 'marcas_veiculo', 'modelos_veiculo', 'versoes_veiculo', 'veiculos_estoque'].includes(entity)
      && ['create', 'update', 'delete'].includes(action)
    ) {
      ensureCanConfigure(access);
    }

    const id = typeof body.id === 'string' ? body.id : '';
    const filters = typeof body.filters === 'object' && body.filters ? body.filters : {};
    const orFilter = typeof body.or === 'string' ? body.or : undefined;
    const search = typeof body.search === 'string' ? body.search : '';
    const orderBy = ORDER_FIELD_MAP[String(body.orderBy || '')] || String(body.orderBy || config.orderBy);
    const orderDirection = body.ascending === true
      ? 'asc'
      : body.ascending === false
        ? 'desc'
        : String(config.orderDirection || 'asc');
    const limit = parseInteger(body.limit, 100, 1, 1000);
    const offset = parseInteger(body.offset, 0, 0, 1000000);
    const page = parseInteger(body.page, Math.floor(offset / limit) + 1, 1, 1000000);
    const effectiveOffset = body.page ? (page - 1) * limit : offset;

    if (action === 'get') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const row = await ensureEntityAccess(entity, id, access, collaborator);
      return json({ row });
    }

    if (action === 'list') {
      const directFilters = { ...filters };
      if (entity === 'atendimentos') {
        delete directFilters.empresa;
        delete directFilters.origem_id;
        delete directFilters.responsavel_id;
      }
      const filterParts = buildSqlFilters(directFilters, 1, baseAlias(entity) || undefined);
      const advancedParts = buildAdvancedFilters(entity, filters, filterParts.values.length + 1);
      const orPart = parseOrFilter(
        orFilter,
        filterParts.values.length + advancedParts.values.length + 1,
        baseAlias(entity) || undefined,
      );
      const searchPart = buildSearchFilter(
        entity,
        search,
        filterParts.values.length + advancedParts.values.length + orPart.values.length + 1,
      );
      const accessPart = buildAccessScope(
        entity,
        access,
        collaborator,
        filterParts.values.length + advancedParts.values.length + orPart.values.length + searchPart.values.length + 1,
      );
      const clauses = [
        ...filterParts.clauses,
        ...advancedParts.clauses,
        orPart.clause,
        searchPart.clause,
        accessPart.clause,
      ].filter(Boolean);
      const whereClause = clauses.length ? `where ${clauses.join(' and ')}` : '';
      const queryValues = [
        ...filterParts.values,
        ...advancedParts.values,
        ...orPart.values,
        ...searchPart.values,
        ...accessPart.values,
      ];
      const rows = await sql.unsafe(
        `${buildListSelect(entity, { withCount: true })} ${whereClause} order by ${scopedColumn(entity, orderBy)} ${orderDirection} limit ${limit} offset ${effectiveOffset};`,
        queryValues,
      );
      const total = rows[0]?.crm_total_count ?? 0;
      for (const row of rows) delete row.crm_total_count;
      return json({
        rows,
        count: Number(total) || 0,
        page,
        pageSize: limit,
        offset: effectiveOffset,
      });
    }

    if (action === 'create') {
      const payload = applyCreateScope(entity, sanitizePayload(entity, body.payload || {}), access, collaborator);
      if (!Object.keys(payload).length) return json({ error: 'Payload vazio.' }, 400);
      validateContactFields(entity, payload);
      const entitiesWithoutCriadoPor = ['categorias_veiculo', 'origens_lead', 'marcas_veiculo', 'modelos_veiculo', 'versoes_veiculo'];
      if (collaborator?.id && !entitiesWithoutCriadoPor.includes(entity)) payload.criado_por = collaborator.id;
      if (entity === 'atendimentos' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'historico_atendimentos' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'historico_atendimentos' && !payload.lead_id && payload.cliente_id) {
        await ensureEntityAccess('clientes', String(payload.cliente_id), access, collaborator);
      }
      if (entity === 'veiculos_interesse' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      const query = buildInsertQuery(CRM_SCHEMA, config.table, payload);
      const rows = await sql.unsafe(query.text, query.values);
      return json({ row: rows[0] || null });
    }

    if (action === 'update') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await ensureEntityAccess(entity, id, access, collaborator);
      const payload = applyCreateScope(entity, sanitizePayload(entity, body.payload || {}), access, collaborator);
      if (!Object.keys(payload).length) return json({ error: 'Nenhum campo para atualizar.' }, 400);
      validateContactFields(entity, payload);
      if (entity === 'atendimentos' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'veiculos_interesse' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      const query = buildUpdateQuery(CRM_SCHEMA, config.table, id, payload);
      const rows = await sql.unsafe(query.text, query.values);
      return json({ row: rows[0] || null });
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await ensureEntityAccess(entity, id, access, collaborator);
      await sql.unsafe(`delete from ${CRM_SCHEMA}.${config.table} where id = $1;`, [id]);
      return json({ success: true });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    const status = getErrorStatus(error);
    if (status >= 500) {
      console.error('[crm-api] erro interno:', error);
    }
    return json({ error: mapDatabaseError(error) }, status);
  }
});
