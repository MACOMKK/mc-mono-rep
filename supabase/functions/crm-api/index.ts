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
    // Tabela fisica e a extensao comercial (gestao_crm.clientes_crm) -- a entidade
    // de API continua se chamando 'clientes' (identidade + extensao combinadas na
    // resposta). Ver 20260915120000_extract_public_clientes.sql.
    table: 'clientes_crm',
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
      'motivo_status_id',
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
      'motivo_status_id',
      'previsao_fechamento',
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
    schema: 'public',
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
    schema: 'public',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['nome', 'ativo'],
  },
  modelos_veiculo: {
    table: 'modelos_veiculo',
    schema: 'public',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['marca_id', 'categoria_veiculo_id', 'nome', 'ativo', 'ano_inicio', 'ano_fim'],
  },
  versoes_veiculo: {
    table: 'versoes_veiculo',
    schema: 'public',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['modelo_id', 'nome', 'ativo'],
  },
  veiculos_estoque: {
    table: 'veiculos_estoque',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: ['condicao', 'status', 'preco', 'observacoes'],
  },
  pipelines: {
    table: 'pipelines',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['nome', 'padrao', 'ativo'],
  },
  etapas_pipeline: {
    table: 'etapas_pipeline',
    orderBy: 'ordem',
    orderDirection: 'asc',
    allowedFields: ['pipeline_id', 'nome', 'cor', 'ordem', 'ativo'],
  },
  motivos_status: {
    table: 'motivos_status',
    orderBy: 'nome',
    orderDirection: 'asc',
    allowedFields: ['status', 'nome', 'ativo'],
  },
  propostas: {
    table: 'propostas',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'lead_id',
      'veiculo_estoque_id',
      'veiculo_descricao',
      'valor_veiculo',
      'desconto_valor',
      'valor_final',
      'forma_pagamento',
      'valor_entrada',
      'status',
      'vendedor_id',
      'validade_ate',
      'observacoes',
    ],
  },
  vendas: {
    table: 'vendas',
    orderBy: 'criado_em',
    orderDirection: 'desc',
    allowedFields: [
      'proposta_id',
      'lead_id',
      'veiculo_estoque_id',
      'vendedor_id',
      'valor_final',
      'forma_pagamento',
      'desconto_valor',
      'data_venda',
      'motivo_status_id',
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

  if (typeof payload.cpf_cnpj === 'string' && payload.cpf_cnpj.trim()) {
    const cpfCnpj = payload.cpf_cnpj.trim();
    payload.cpf_cnpj = cpfCnpj;
    payload.cpf_cnpj_normalizado = cpfCnpj.replace(/\D/g, '');
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

  if (message.includes('idx_clientes_telefone_unique')) {
    return 'Ja existe outro cliente com este telefone.';
  }

  if (message.includes('idx_clientes_email_unique')) {
    return 'Ja existe outro cliente com este e-mail.';
  }

  if (message.includes('idx_clientes_cpf_cnpj_unique')) {
    return 'Ja existe outro cliente com este CPF/CNPJ.';
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

  if (message.includes('veiculos_chassi_key')) {
    return 'Ja existe um veiculo com este chassi.';
  }

  if (message.includes('idx_veiculos_placa_unique')) {
    return 'Ja existe um veiculo com esta placa.';
  }

  if (message.includes('pipelines_nome_key')) {
    return 'Ja existe um pipeline com este nome.';
  }

  if (message.includes('etapas_pipeline_pipeline_id_ordem_key')) {
    return 'Ja existe uma etapa nesta posicao do pipeline.';
  }

  if (message.includes('etapas_pipeline_pipeline_id_chave_sistema_key')) {
    return 'Ja existe uma etapa de sistema com esta chave neste pipeline.';
  }

  if (message.includes('nao pode ser excluido') || message.includes('nao podem ser excluidas') || message.includes('nao podem trocar de pipeline')) {
    return message;
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

  if (message.includes('Selecione um motivo para mover o lead')
    || message.includes('motivo selecionado nao e valido')
    || message.includes('Informe a previsao de fechamento para mover o lead')
    || message.includes('Selecione um motivo para concluir esta atividade')
    || message.includes('Informe a previsao de fechamento para concluir esta atividade')) {
    return message;
  }

  if (message.includes('motivos_status_status_nome_key')) {
    return 'Ja existe um motivo com este nome para este status.';
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

  if (message.includes('vendas_veiculo_estoque_id_key') || message.includes('Este veiculo ja foi vendido')) {
    return 'Este veiculo ja foi vendido.';
  }

  if (message.includes('propostas_veiculo_check')) {
    return 'Selecione um veiculo do estoque ou descreva o veiculo da proposta.';
  }

  if (message.includes('Proposta aceita nao pode ter o status alterado')) {
    return 'Proposta aceita nao pode ter o status alterado diretamente.';
  }

  if (message.includes('Lead vinculado a proposta nao foi encontrado')
    || message.includes('Lead vinculado a venda nao foi encontrado')) {
    return 'Lead nao encontrado ou sem permissao.';
  }

  if (message.includes('Veiculo em estoque nao foi encontrado')) {
    return 'Veiculo em estoque nao encontrado.';
  }

  if (message.includes('Lead so pode ser convertido ao aceitar uma proposta ou fechar uma venda')) {
    return 'Lead so pode ser convertido ao aceitar uma proposta ou fechar uma venda.';
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

const VEICULO_ALLOWED_FIELDS = [
  'modelo_id',
  'versao_id',
  'chassi',
  'placa',
  'cor',
  'km',
] as const;

function sanitizeVeiculoPayload(payload: Record<string, unknown> = {}) {
  const sanitized: Record<string, unknown> = {};
  for (const field of VEICULO_ALLOWED_FIELDS) {
    if (field in payload) {
      sanitized[field] = payload[field];
    }
  }
  if (typeof sanitized.chassi === 'string') {
    sanitized.chassi = sanitized.chassi.trim().toUpperCase();
  }
  if (typeof sanitized.placa === 'string') {
    sanitized.placa = sanitized.placa.trim().toUpperCase().replace(/\s+/g, '') || null;
  }
  return sanitized;
}

// cliente e dividido entre public.clientes (identidade, reaproveitavel por
// outros apps) e ${CRM_SCHEMA}.clientes_crm (extensao comercial do CRM) -- mesmo
// id nas duas tabelas. Ver 20260915120000_extract_public_clientes.sql.
const CLIENTE_IDENTITY_FIELDS = [
  'nome',
  'telefone',
  'telefone_normalizado',
  'email',
  'email_normalizado',
  'cpf_cnpj',
  'cpf_cnpj_normalizado',
] as const;

const CLIENTE_EXTENSAO_FIELDS = [
  'empresa',
  'status_relacionamento',
  'observacoes',
  'criado_por',
] as const;

function splitClientePayload(payload: Record<string, unknown>) {
  const identidade: Record<string, unknown> = {};
  const extensao: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(payload)) {
    if ((CLIENTE_IDENTITY_FIELDS as readonly string[]).includes(field)) {
      identidade[field] = value;
    } else if ((CLIENTE_EXTENSAO_FIELDS as readonly string[]).includes(field)) {
      extensao[field] = value;
    }
  }
  return { identidade, extensao };
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
    pushText('v.chassi');
    pushText('v.placa');
    pushText('v.cor');
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

  if (entity === 'veiculos_estoque') {
    return `
      select ${countExpr}ve.*, row_to_json(v) as veiculo
      from ${CRM_SCHEMA}.veiculos_estoque ve
      join public.veiculos v on v.id = ve.veiculo_id
    `;
  }

  if (entity === 'clientes') {
    // Tabela fisica e clientes_crm (extensao comercial); o FROM usa "as clientes"
    // para que access-scope.ts continue referenciando o nome logico "clientes"
    // sem qualificacao (buildAccessScope conta com esse nome de range-table).
    return `
      select ${countExpr}clientes.*, p.nome, p.telefone, p.telefone_normalizado,
        p.email, p.email_normalizado, p.cpf_cnpj
      from ${CRM_SCHEMA}.clientes_crm as clientes
      join public.clientes p on p.id = clientes.id
    `;
  }

  if (entity !== 'atendimentos') {
    const entitySchema = ENTITY_CONFIG[entity].schema ?? CRM_SCHEMA;
    return `select ${countExpr}* from ${entitySchema}.${ENTITY_CONFIG[entity].table}`;
  }

  return `
    select
      ${countExpr}a.*,
      row_to_json(l) as lead,
      case
        when c.id is null then null
        else (select row_to_json(cj) from (select c.*, cp.nome, cp.telefone, cp.telefone_normalizado,
          cp.email, cp.email_normalizado, cp.cpf_cnpj) cj)
      end as cliente,
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
    left join ${CRM_SCHEMA}.clientes_crm c on c.id = a.cliente_id
    left join public.clientes cp on cp.id = c.id
    left join public.colaboradores r on r.id = l.responsavel_id
    left join ${CRM_SCHEMA}.origens_lead lo on lo.id = l.origem_id
  `;
}

function baseAlias(entity: EntityName) {
  if (entity === 'atendimentos') return 'a';
  if (entity === 'leads') return 'l';
  if (entity === 'veiculos_estoque') return 've';
  // 'clientes' e nao 'c'/alias curto porque nao e um alias de verdade -- e o
  // proprio nome da tabela base no FROM (sem "as"). Necessario para desambiguar
  // colunas presentes nas duas tabelas do join (id/criado_em/atualizado_em) desde
  // que public.clientes entrou no join em buildListSelect.
  if (entity === 'clientes') return 'clientes';
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
         and l.status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao')
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
          : await transaction.unsafe(`select count(*)::int as count from ${CRM_SCHEMA}.clientes_crm;`);

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
          const clienteIds = (await transaction.unsafe(`select id from ${CRM_SCHEMA}.clientes_crm;`)).map(
            (row: { id: string }) => row.id,
          );
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.historico_atendimentos;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.atendimentos;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.leads;`);
          await transaction.unsafe(`delete from ${CRM_SCHEMA}.clientes_crm;`);
          // identidade em public.clientes so e removida depois da extensao (FK
          // clientes_crm_id_fkey) -- se algum dia existir extensao de outro app (ex.:
          // servicos) para o mesmo id, isso precisa passar a filtrar quem ainda tem
          // extensao viva antes de apagar a identidade.
          if (clienteIds.length) {
            await transaction.unsafe(`delete from public.clientes where id = any($1);`, [clienteIds]);
          }
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

      let existingLead: Record<string, unknown> | null = null;
      if (leadId) {
        existingLead = await ensureEntityAccess('leads', leadId, access, collaborator);
      }

      const { identidade: clienteIdentidadeRaw, extensao: clienteExtensaoRaw } = splitClientePayload(clientePayloadRaw);

      const result = await sql.begin(async (transaction) => {
        // identidade (public.clientes): dedup por telefone/email, reaproveitavel por
        // qualquer app -- ver 20260915120000_extract_public_clientes.sql.
        const phone = String(clienteIdentidadeRaw.telefone_normalizado || '');
        const email = String(clienteIdentidadeRaw.email_normalizado || '');
        const existingClienteRows = phone
          ? await transaction.unsafe(
              `select * from public.clientes where telefone_normalizado = $1 ${email ? 'or email_normalizado = $2' : ''} limit 1;`,
              email ? [phone, email] : [phone],
            )
          : [];

        let clienteIdentidade;
        if (existingClienteRows[0]) {
          const mergedIdentidade = {
            ...clienteIdentidadeRaw,
            nome: clienteIdentidadeRaw.nome || existingClienteRows[0].nome,
            email: clienteIdentidadeRaw.email || existingClienteRows[0].email,
            email_normalizado: clienteIdentidadeRaw.email_normalizado || existingClienteRows[0].email_normalizado,
          };
          const updateQuery = buildUpdateQuery('public', 'clientes', existingClienteRows[0].id, mergedIdentidade);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          clienteIdentidade = rows[0];
        } else {
          const insertQuery = buildInsertQuery('public', 'clientes', clienteIdentidadeRaw);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          clienteIdentidade = rows[0];
        }

        // extensao comercial (gestao_crm.clientes_crm), mesmo id da identidade -- pode
        // ja existir mesmo numa identidade recem-criada? nao, mas pode ja existir
        // extensao para uma identidade que ja era cliente de outra origem (ex.: futura
        // extensao de servicos), entao sempre verificamos por id antes de decidir
        // insert/update.
        const existingExtensaoRows = await transaction.unsafe(
          `select * from ${CRM_SCHEMA}.clientes_crm where id = $1 limit 1;`,
          [clienteIdentidade.id],
        );

        let cliente;
        if (existingExtensaoRows[0]) {
          const mergedExtensao = applyCreateScope('clientes', {
            ...clienteExtensaoRaw,
            status_relacionamento: clienteExtensaoRaw.status_relacionamento || existingExtensaoRows[0].status_relacionamento,
          }, access, collaborator);
          const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'clientes_crm', clienteIdentidade.id, mergedExtensao);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          cliente = { ...rows[0], ...clienteIdentidade };
        } else {
          const insertPayload = applyCreateScope('clientes', { ...clienteExtensaoRaw }, access, collaborator);
          insertPayload.id = clienteIdentidade.id;
          if (collaborator?.id) insertPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'clientes_crm', insertPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          cliente = { ...rows[0], ...clienteIdentidade };
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

        if (existingLead && existingLead.status !== leadRow.status) {
          const statusChangePayload: Record<string, unknown> = {
            cliente_id: leadRow.cliente_id,
            lead_id: leadRow.id,
            atendimento_id: null,
            tipo: 'atualizacao_lead',
            descricao: `Status alterado de ${existingLead.status} para ${leadRow.status}.`,
            entidade: 'Lead',
            entidade_id: leadRow.id,
            status: leadRow.status,
            metadados: {
              status_anterior: existingLead.status,
              status_novo: leadRow.status,
              motivo_status_id: leadRow.motivo_status_id || null,
            },
          };
          if (collaborator?.id) statusChangePayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'historico_atendimentos', statusChangePayload);
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

    if (action === 'save_veiculo_estoque_full') {
      ensureCanConfigure(access);

      const estoqueId = typeof body.estoqueId === 'string' && body.estoqueId ? body.estoqueId : '';
      const veiculoPayloadRaw = sanitizeVeiculoPayload(body.veiculoPayload || {});
      const estoquePayloadRaw = sanitizePayload('veiculos_estoque', body.estoquePayload || {});

      const result = await sql.begin(async (transaction) => {
        let veiculoRow;
        if (estoqueId) {
          const existing = await transaction.unsafe(
            `select veiculo_id from ${CRM_SCHEMA}.veiculos_estoque where id = $1 limit 1;`,
            [estoqueId],
          );
          const veiculoId = existing[0]?.veiculo_id;
          if (!veiculoId) {
            throw Object.assign(new Error('Veiculo em estoque nao encontrado.'), { status: 404 });
          }
          const updateQuery = buildUpdateQuery('public', 'veiculos', veiculoId, veiculoPayloadRaw);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          veiculoRow = rows[0];
        } else {
          const insertQuery = buildInsertQuery('public', 'veiculos', veiculoPayloadRaw);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          veiculoRow = rows[0];
        }

        let estoqueRow;
        if (estoqueId) {
          const updateQuery = buildUpdateQuery(CRM_SCHEMA, 'veiculos_estoque', estoqueId, estoquePayloadRaw);
          const rows = await transaction.unsafe(updateQuery.text, updateQuery.values);
          estoqueRow = rows[0];
        } else {
          const insertPayload = { ...estoquePayloadRaw, veiculo_id: veiculoRow.id };
          if (collaborator?.id) insertPayload.criado_por = collaborator.id;
          const insertQuery = buildInsertQuery(CRM_SCHEMA, 'veiculos_estoque', insertPayload);
          const rows = await transaction.unsafe(insertQuery.text, insertQuery.values);
          estoqueRow = rows[0];
        }

        return { estoque: estoqueRow, veiculo: veiculoRow };
      });

      return json(result);
    }

    // accept_proposta/close_venda sao as unicas portas para criar gestao_crm.vendas:
    // o INSERT dispara trg_crm_vendas_outcome (baixa de estoque + conversao do lead +
    // historico) dentro da mesma transacao que marca a proposta como aceita (quando
    // houver). Nunca expor 'vendas' via action 'create' generica para nao permitir
    // criar uma venda sem passar por essa validacao.
    if (action === 'accept_proposta') {
      const propostaId = typeof body.propostaId === 'string' && body.propostaId ? body.propostaId : '';
      if (!propostaId) return json({ error: 'Proposta obrigatoria.' }, 400);

      const proposta = await ensureEntityAccess('propostas', propostaId, access, collaborator);
      if (!['rascunho', 'enviada'].includes(String(proposta.status))) {
        return json({ error: 'Apenas propostas em rascunho ou enviadas podem ser aceitas.' }, 400);
      }

      const vendaPayloadRaw = sanitizePayload('vendas', body.vendaPayload || {});
      const veiculoEstoqueId = vendaPayloadRaw.veiculo_estoque_id || proposta.veiculo_estoque_id;
      if (!veiculoEstoqueId) {
        return json({ error: 'Esta proposta nao tem um veiculo do estoque vinculado. Vincule um veiculo antes de aceitar.' }, 400);
      }
      if (!vendaPayloadRaw.valor_final) {
        return json({ error: 'Informe o valor final da venda.' }, 400);
      }
      if (!vendaPayloadRaw.forma_pagamento) {
        return json({ error: 'Informe a forma de pagamento da venda.' }, 400);
      }
      if (!vendaPayloadRaw.motivo_status_id) {
        return json({ error: 'Selecione o motivo de conversao do lead.' }, 400);
      }

      const result = await sql.begin(async (transaction) => {
        const updateProposta = buildUpdateQuery(CRM_SCHEMA, 'propostas', propostaId, { status: 'aceita' });
        const propostaRows = await transaction.unsafe(updateProposta.text, updateProposta.values);

        const vendaPayload: Record<string, unknown> = {
          ...vendaPayloadRaw,
          proposta_id: propostaId,
          lead_id: proposta.lead_id,
          veiculo_estoque_id: veiculoEstoqueId,
          vendedor_id: vendaPayloadRaw.vendedor_id || proposta.vendedor_id,
        };
        if (collaborator?.id) vendaPayload.criado_por = collaborator.id;
        const insertVenda = buildInsertQuery(CRM_SCHEMA, 'vendas', vendaPayload);
        const vendaRows = await transaction.unsafe(insertVenda.text, insertVenda.values);

        return { proposta: propostaRows[0], venda: vendaRows[0] };
      });

      return json(result);
    }

    if (action === 'close_venda') {
      const vendaPayloadRaw = sanitizePayload('vendas', body.vendaPayload || body.payload || {});
      const leadId = typeof vendaPayloadRaw.lead_id === 'string' && vendaPayloadRaw.lead_id ? vendaPayloadRaw.lead_id : '';
      if (!leadId) return json({ error: 'Lead obrigatorio.' }, 400);
      if (!vendaPayloadRaw.veiculo_estoque_id) return json({ error: 'Selecione o veiculo vendido.' }, 400);
      if (!vendaPayloadRaw.valor_final) return json({ error: 'Informe o valor final da venda.' }, 400);
      if (!vendaPayloadRaw.forma_pagamento) return json({ error: 'Informe a forma de pagamento da venda.' }, 400);
      if (!vendaPayloadRaw.motivo_status_id) return json({ error: 'Selecione o motivo de conversao do lead.' }, 400);

      await ensureLeadAccessLight(leadId, access, collaborator);

      const vendaPayload: Record<string, unknown> = { ...vendaPayloadRaw, proposta_id: null };
      if (collaborator?.id) vendaPayload.criado_por = collaborator.id;
      const insertVenda = buildInsertQuery(CRM_SCHEMA, 'vendas', vendaPayload);
      const vendaRows = await sql.unsafe(insertVenda.text, insertVenda.values);

      return json({ venda: vendaRows[0] });
    }

    const entity = String(body.entity || '') as EntityName;
    const config = ENTITY_CONFIG[entity];

    if (!config) {
      return json({ error: 'Entidade invalida.' }, 400);
    }

    if (
      ['categorias_veiculo', 'marcas_veiculo', 'modelos_veiculo', 'versoes_veiculo', 'veiculos_estoque', 'pipelines', 'etapas_pipeline'].includes(entity)
      && ['create', 'update', 'delete'].includes(action)
    ) {
      ensureCanConfigure(access);
    }

    // gestao_crm.vendas so pode ser criada via accept_proposta/close_venda (efeitos
    // colaterais em outras tabelas dentro da mesma transacao) -- nunca via create
    // generico, que pularia a baixa de estoque e a conversao do lead.
    if (entity === 'vendas' && action === 'create') {
      return json({ error: 'Use a acao de aceitar proposta ou fechar venda direta.' }, 400);
    }

    // Proposta so pode virar 'aceita' atraves de accept_proposta, porque essa
    // transicao tem efeito colateral obrigatorio (criar a Venda). Um UPDATE generico
    // com status='aceita' ficaria com a proposta aceita sem venda nenhuma registrada.
    if (entity === 'propostas' && action === 'update' && body.payload?.status === 'aceita') {
      return json({ error: 'Use a acao de aceitar proposta.' }, 400);
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
      const entitiesWithoutCriadoPor = ['categorias_veiculo', 'origens_lead', 'marcas_veiculo', 'modelos_veiculo', 'versoes_veiculo', 'pipelines', 'etapas_pipeline', 'motivos_status'];
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
      if (entity === 'propostas' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'clientes') {
        const { identidade, extensao } = splitClientePayload(payload);
        if (!identidade.nome || !identidade.telefone) {
          return json({ error: 'Nome e telefone sao obrigatorios.' }, 400);
        }
        const row = await sql.begin(async (transaction) => {
          const insertIdentidade = buildInsertQuery('public', 'clientes', identidade);
          const identRows = await transaction.unsafe(insertIdentidade.text, insertIdentidade.values);
          const identRow = identRows[0];
          const insertExtensao = buildInsertQuery(CRM_SCHEMA, 'clientes_crm', { ...extensao, id: identRow.id });
          const extRows = await transaction.unsafe(insertExtensao.text, insertExtensao.values);
          return { ...extRows[0], ...identRow };
        });
        return json({ row });
      }
      const query = buildInsertQuery(config.schema ?? CRM_SCHEMA, config.table, payload);
      const rows = await sql.unsafe(query.text, query.values);
      return json({ row: rows[0] || null });
    }

    if (action === 'update') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      const existingRow = await ensureEntityAccess(entity, id, access, collaborator);
      const payload = applyCreateScope(entity, sanitizePayload(entity, body.payload || {}), access, collaborator);
      if (!Object.keys(payload).length) return json({ error: 'Nenhum campo para atualizar.' }, 400);
      validateContactFields(entity, payload);
      if (entity === 'atendimentos' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'veiculos_interesse' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'propostas' && payload.lead_id) {
        await ensureLeadAccessLight(String(payload.lead_id), access, collaborator);
      }
      if (entity === 'clientes') {
        const { identidade, extensao } = splitClientePayload(payload);
        const { identidadeRow, extensaoRow } = await sql.begin(async (transaction) => {
          let identidadeRow: Record<string, unknown> | null = null;
          let extensaoRow: Record<string, unknown> | null = null;
          if (Object.keys(identidade).length) {
            const q = buildUpdateQuery('public', 'clientes', id, identidade);
            const rows = await transaction.unsafe(q.text, q.values);
            identidadeRow = rows[0] || null;
          }
          if (Object.keys(extensao).length) {
            const q = buildUpdateQuery(CRM_SCHEMA, 'clientes_crm', id, extensao);
            const rows = await transaction.unsafe(q.text, q.values);
            extensaoRow = rows[0] || null;
          }
          return { identidadeRow, extensaoRow };
        });
        return json({ row: { ...existingRow, ...extensaoRow, ...identidadeRow } });
      }
      const query = buildUpdateQuery(config.schema ?? CRM_SCHEMA, config.table, id, payload);
      const rows = await sql.unsafe(query.text, query.values);
      const row = rows[0] || null;

      if (entity === 'leads' && row && 'status' in payload && existingRow.status !== row.status) {
        const statusChangePayload: Record<string, unknown> = {
          cliente_id: row.cliente_id,
          lead_id: row.id,
          atendimento_id: null,
          tipo: 'atualizacao_lead',
          descricao: `Status alterado de ${existingRow.status} para ${row.status}.`,
          entidade: 'Lead',
          entidade_id: row.id,
          status: row.status,
          metadados: {
            status_anterior: existingRow.status,
            status_novo: row.status,
            motivo_status_id: row.motivo_status_id || null,
          },
        };
        if (collaborator?.id) statusChangePayload.criado_por = collaborator.id;
        const insertQuery = buildInsertQuery(CRM_SCHEMA, 'historico_atendimentos', statusChangePayload);
        await sql.unsafe(insertQuery.text, insertQuery.values);
      }

      return json({ row });
    }

    if (action === 'delete') {
      if (!id) return json({ error: 'ID obrigatorio.' }, 400);
      await ensureEntityAccess(entity, id, access, collaborator);
      await sql.unsafe(`delete from ${config.schema ?? CRM_SCHEMA}.${config.table} where id = $1;`, [id]);
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
