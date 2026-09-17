import { crmApi } from '@macom/api-client/crmApi';
import { assertSupabaseConfigured, supabase } from '@macom/api-client/supabaseClient';
import {
  LEAD_STATUS_LABEL,
  LEAD_STATUS_REQUIREMENTS,
  RESULTADO_LEAD_STATUS_TARGET,
  isLeadEligibleForResultado,
} from '@/lib/leadStatus';

const CRM_ATTACHMENTS_BUCKET = 'crm-anexos';

const SORT_KEY_MAP = {
  created_date: 'criado_em',
  updated_date: 'atualizado_em',
  tipo_evento: 'tipo_atendimento',
};

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(email) {
  return normalizeText(email);
}

function normalizeEmpresa(empresa) {
  const value = String(empresa || '').trim();
  const plain = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (plain.includes('paragominas')) return 'Macom Paragominas';
  if (plain.includes('belem') || plain.includes('bel')) return 'Macom Belém';
  return 'Macom Ananindeua';
}

function normalizeDateOnly(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function sanitizeFileName(name = 'anexo') {
  const normalized = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'anexo';
}

function requireNormalizedPhone(phone, context) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    throw new Error(`${context} deve ter telefone.`);
  }
  if (normalized.length < 10 || normalized.length > 11) {
    throw new Error(`Telefone de ${context.toLowerCase()} invalido. Informe DDD + numero (10 ou 11 digitos).`);
  }
  return normalized;
}

function requireValidEmail(email, context) {
  const trimmed = String(email || '').trim();
  if (!trimmed) return '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error(`E-mail de ${context.toLowerCase()} invalido. Informe um e-mail no formato nome@dominio.com.`);
  }
  return trimmed;
}

function requireFullName(name, context) {
  const trimmed = String(name || '').trim().replace(/\s+/g, ' ');
  const parts = trimmed.split(' ').filter((part) => part.length >= 2);
  if (parts.length < 2) {
    throw new Error(`Nome de ${context.toLowerCase()} deve ter nome e sobrenome.`);
  }
  return trimmed;
}

function toError(error, fallbackMessage) {
  if (!error) return new Error(fallbackMessage);

  const message = String(error.message || fallbackMessage);
  const normalized = message.toLowerCase();

  if (normalized.includes('idx_crm_leads_cliente_ativo_unique')) {
    return new Error('Ja existe um lead ativo para este cliente.');
  }

  if (normalized.includes('idx_crm_atendimentos_lead_aberto_unique')) {
    return new Error('Este lead ja possui uma atividade planejada.');
  }

  if (normalized.includes('idx_crm_atendimentos_lead_planejada_unique')) {
    return new Error('Este lead ja possui uma atividade planejada.');
  }

  if (normalized.includes('idx_crm_clientes_telefone_unique')) {
    return new Error('Ja existe outro cliente com este telefone.');
  }

  if (normalized.includes('idx_crm_clientes_email_unique')) {
    return new Error('Ja existe outro cliente com este e-mail.');
  }

  const err = new Error(message);
  err.status = error.status || 500;
  err.details = error;
  return err;
}

function parseSort(orderBy = '-created_date') {
  const descending = String(orderBy).startsWith('-');
  const rawField = String(orderBy).replace(/^-/, '');
  return {
    field: SORT_KEY_MAP[rawField] || rawField,
    ascending: !descending,
  };
}

function mapBaseDates(row = {}) {
  return {
    created_date: row.criado_em || row.created_date || null,
    updated_date: row.atualizado_em || row.updated_date || null,
  };
}

function mapClienteRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    telefone: row.telefone || '',
    telefone_normalizado: row.telefone_normalizado || normalizePhone(row.telefone),
    email: row.email || '',
    email_normalizado: row.email_normalizado || normalizeEmail(row.email),
    empresa: row.empresa || 'Macom Ananindeua',
    status_relacionamento: row.status_relacionamento || 'lead',
    observacoes: row.observacoes || '',
    ...mapBaseDates(row),
  };
}

function mapLeadRow(row = {}) {
  const vehicle = mapVeiculoInteresseRow(row.veiculo_interesse || row.veiculo_principal || {});
  const vehicleLabel = formatVehicleLabel(vehicle);
  const slaDeadline = row.sla_primeiro_contato_em || null;
  const firstContact = row.primeiro_contato_em || null;
  const slaAlertMinutes = Number(row.sla_alerta_minutos ?? 10);
  const deadlineTime = slaDeadline ? new Date(slaDeadline).getTime() : null;
  const remainingMinutes = deadlineTime
    ? Math.ceil((deadlineTime - Date.now()) / 60000)
    : null;
  const slaStatus = firstContact
    ? 'concluido'
    : deadlineTime && deadlineTime < Date.now()
      ? 'atrasado'
      : remainingMinutes !== null && remainingMinutes <= slaAlertMinutes
        ? 'alerta'
      : 'no_prazo';

  return {
    id: row.id,
    cliente_id: row.cliente_id || '',
    nome: row.nome || '',
    telefone: row.telefone || '',
    telefone_normalizado: row.telefone_normalizado || normalizePhone(row.telefone),
    email: row.email || '',
    email_normalizado: row.email_normalizado || normalizeEmail(row.email),
    origem_id: row.origem_id || '',
    origem: row.origem_nome || '',
    status: row.status || 'novo',
    motivo_status_id: row.motivo_status_id || '',
    modelo_interesse: vehicleLabel || row.modelo_interesse || '',
    veiculo_interesse: vehicle.id ? vehicle : null,
    empresa: row.empresa || 'Macom Ananindeua',
    convertido_em: row.convertido_em || null,
    perdido_em: row.perdido_em || null,
    motivo_perda: row.motivo_perda || '',
    responsavel_id: row.responsavel_id || '',
    responsavel: row.responsavel || null,
    responsavel_nome: row.responsavel?.nome || '',
    unidade_id: row.unidade_id || row.responsavel?.unidade_id || '',
    atribuido_em: row.atribuido_em || null,
    primeiro_contato_em: firstContact,
    sla_primeiro_contato_em: slaDeadline,
    sla_primeiro_contato_minutos: Number(row.sla_primeiro_contato_minutos ?? 30),
    sla_alerta_minutos: slaAlertMinutes,
    sla_minutos_restantes: remainingMinutes,
    sla_status: slaStatus,
    previsao_fechamento: normalizeDateOnly(row.previsao_fechamento),
    observacoes: row.observacoes || '',
    ...mapBaseDates(row),
  };
}

function formatVehicleLabel(vehicle) {
  vehicle = vehicle || {};
  return [
    vehicle.marca,
    vehicle.modelo,
    vehicle.versao,
    vehicle.ano,
  ].filter(Boolean).join(' ');
}

function mapVeiculoInteresseRow(row = {}) {
  return {
    id: row.id || '',
    lead_id: row.lead_id || '',
    marca: row.marca || '',
    modelo: row.modelo || '',
    marca_id: row.marca_id || null,
    modelo_id: row.modelo_id || null,
    marca_outro: row.marca_outro || '',
    modelo_outro: row.modelo_outro || '',
    versao_id: row.versao_id || null,
    versao_outro: row.versao_outro || '',
    versao: row.versao || '',
    ano: row.ano || '',
    categoria_veiculo_id: row.categoria_veiculo_id || null,
    condicao: row.condicao || 'novo',
    faixa_preco_min: row.faixa_preco_min ?? '',
    faixa_preco_max: row.faixa_preco_max ?? '',
    cor_preferida: row.cor_preferida || '',
    combustivel: row.combustivel || '',
    cambio: row.cambio || '',
    atributos: row.atributos || {},
    principal: row.principal !== false,
    observacoes: row.observacoes || '',
    ...mapBaseDates(row),
  };
}

function mapCategoriaVeiculoRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    ativo: row.ativo !== false,
    campos_extra: Array.isArray(row.campos_extra) ? row.campos_extra : [],
    ...mapBaseDates(row),
  };
}

function mapOrigemLeadRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapMotivoStatusRow(row = {}) {
  return {
    id: row.id,
    status: row.status || '',
    nome: row.nome || '',
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapPipelineRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    padrao: row.padrao === true,
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapEtapaPipelineRow(row = {}) {
  return {
    id: row.id,
    pipeline_id: row.pipeline_id || '',
    nome: row.nome || '',
    cor: row.cor || '#90CAF9',
    ordem: row.ordem ?? 0,
    chave_sistema: row.chave_sistema || null,
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapMarcaVeiculoRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapModeloVeiculoRow(row = {}) {
  return {
    id: row.id,
    marca_id: row.marca_id || '',
    categoria_veiculo_id: row.categoria_veiculo_id || '',
    nome: row.nome || '',
    ativo: row.ativo !== false,
    ano_inicio: row.ano_inicio ?? null,
    ano_fim: row.ano_fim ?? null,
    ...mapBaseDates(row),
  };
}

function mapVersaoVeiculoRow(row = {}) {
  return {
    id: row.id,
    modelo_id: row.modelo_id || '',
    nome: row.nome || '',
    ativo: row.ativo !== false,
    ...mapBaseDates(row),
  };
}

function mapVeiculoEstoqueRow(row = {}) {
  const veiculo = row.veiculo || {};
  return {
    id: row.id,
    veiculo_id: row.veiculo_id || veiculo.id || '',
    modelo_id: veiculo.modelo_id || '',
    versao_id: veiculo.versao_id || null,
    chassi: veiculo.chassi || '',
    placa: veiculo.placa || '',
    cor: veiculo.cor || '',
    km: veiculo.km ?? null,
    condicao: row.condicao || 'novo',
    status: row.status || 'disponivel',
    preco: row.preco ?? null,
    observacoes: row.observacoes || '',
    ...mapBaseDates(row),
  };
}

function mapEventoRow(row = {}) {
  const lead = row.lead || row.leads || {};
  const cliente = row.cliente || row.clientes || {};
  const responsavel = row.responsavel || lead.responsavel || null;
  const legacyStatusMap = {
    aguardando: 'planejada',
    andamento: 'planejada',
    concluido: 'concluida',
    cancelado: 'cancelada',
    sucesso: 'concluida',
    insucesso: 'concluida',
  };
  const normalizedStatus = legacyStatusMap[row.status] || row.status || 'planejada';
  const normalizedResult = row.resultado
    || (row.status === 'sucesso' ? 'contato_realizado' : '')
    || (row.status === 'insucesso' ? 'sem_resposta' : '');

  return {
    id: row.id,
    lead_id: row.lead_id || '',
    cliente_id: row.cliente_id || '',
    cliente_nome: cliente.nome || lead.nome || row.cliente_nome || '',
    telefone: cliente.telefone || lead.telefone || row.telefone || '',
    telefone_normalizado: cliente.telefone_normalizado || lead.telefone_normalizado || row.telefone_normalizado || '',
    titulo: row.titulo || '',
    status: normalizedStatus,
    tipo_evento: row.tipo_atendimento || row.tipo_evento || 'ligacao',
    temperatura: row.temperatura || 'morno',
    origem_id: lead.origem_id || row.origem_id || '',
    origem: lead.origem_nome || row.lead_origem_nome || '',
    empresa: lead.empresa || cliente.empresa || row.empresa || 'Macom Ananindeua',
    modelo_interesse: lead.modelo_interesse || row.modelo_interesse || '',
    responsavel_id: lead.responsavel_id || row.responsavel_id || '',
    responsavel,
    responsavel_nome: responsavel?.nome || '',
    proximo_contato: normalizeDateOnly(row.proximo_contato),
    observacoes: row.observacoes || '',
    resultado: normalizedResult,
    motivo_resultado: row.motivo_resultado || '',
    motivo_status_id: row.motivo_status_id || '',
    previsao_fechamento: normalizeDateOnly(row.previsao_fechamento),
    concluido_em: row.concluido_em || null,
    ...mapBaseDates(row),
  };
}

function mapHistoricoRow(row = {}) {
  return {
    id: row.id,
    cliente_id: row.cliente_id || '',
    lead_id: row.lead_id || '',
    atendimento_id: row.atendimento_id || row.entidade_id || '',
    tipo: row.tipo || '',
    descricao: row.descricao || '',
    entidade: row.entidade || '',
    entidade_id: row.entidade_id || row.atendimento_id || row.lead_id || '',
    status: row.status || '',
    metadados: row.metadados || {},
    created_date: row.criado_em || null,
  };
}

function mapClientePayload(data = {}) {
  const nome = requireFullName(data.nome || data.cliente_nome, 'Cliente');
  const phone = requireNormalizedPhone(data.telefone, 'Cliente');
  const email = requireValidEmail(data.email, 'Cliente');

  return {
    nome,
    telefone: phone,
    telefone_normalizado: phone,
    email: email || null,
    email_normalizado: normalizeEmail(email) || null,
    empresa: normalizeEmpresa(data.empresa),
    status_relacionamento: data.status_relacionamento || 'lead',
    observacoes: data.observacoes || null,
  };
}

function mapLeadPayload(data = {}, clienteId) {
  const nome = requireFullName(data.nome, 'Lead');
  const phone = requireNormalizedPhone(data.telefone, 'Lead');
  const email = requireValidEmail(data.email, 'Lead');

  if (['qualificado', 'convertido', 'perdido'].includes(data.status) && !data.motivo_status_id) {
    throw new Error(`Selecione um motivo para mover o lead para ${LEAD_STATUS_LABEL[data.status] || data.status}.`);
  }

  if (data.status === 'negociacao' && !data.previsao_fechamento) {
    throw new Error('Informe a previsao de fechamento para mover o lead para negociacao.');
  }

  if (!data.origem_id) {
    throw new Error('Selecione a origem do lead.');
  }

  return {
    cliente_id: clienteId || data.cliente_id,
    nome,
    telefone: phone,
    telefone_normalizado: phone,
    email: email || null,
    email_normalizado: normalizeEmail(email) || null,
    origem_id: data.origem_id,
    status: data.status || 'novo',
    modelo_interesse: data.modelo_interesse || formatVehicleLabel(data.veiculo_interesse) || null,
    empresa: normalizeEmpresa(data.empresa),
    convertido_em: data.status === 'convertido'
      ? (data.convertido_em || new Date().toISOString())
      : (data.convertido_em || null),
    perdido_em: data.status === 'perdido'
      ? (data.perdido_em || new Date().toISOString())
      : (data.perdido_em || null),
    motivo_perda: data.status === 'perdido' ? String(data.motivo_perda || '').trim() || null : null,
    motivo_status_id: ['qualificado', 'convertido', 'perdido'].includes(data.status) ? data.motivo_status_id : null,
    responsavel_id: data.responsavel_id || null,
    unidade_id: data.unidade_id || null,
    previsao_fechamento: data.previsao_fechamento || null,
    observacoes: data.observacoes || null,
  };
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapVeiculoInteressePayload(data = {}, leadId) {
  const vehicle = data.veiculo_interesse || {};
  return {
    lead_id: leadId || vehicle.lead_id,
    marca: vehicle.marca || null,
    modelo: vehicle.modelo || data.modelo_interesse || null,
    marca_id: vehicle.marca_id || null,
    modelo_id: vehicle.modelo_id || null,
    marca_outro: vehicle.marca_outro || null,
    modelo_outro: vehicle.modelo_outro || null,
    versao_id: vehicle.versao_id || null,
    versao_outro: vehicle.versao_outro || null,
    versao: vehicle.versao || null,
    ano: toNullableNumber(vehicle.ano),
    categoria_veiculo_id: vehicle.categoria_veiculo_id || null,
    condicao: vehicle.condicao || 'novo',
    faixa_preco_min: toNullableNumber(vehicle.faixa_preco_min),
    faixa_preco_max: toNullableNumber(vehicle.faixa_preco_max),
    cor_preferida: vehicle.cor_preferida || null,
    combustivel: vehicle.combustivel || null,
    cambio: vehicle.cambio || null,
    atributos: vehicle.atributos || {},
    principal: true,
    observacoes: vehicle.observacoes || null,
  };
}

function hasVehicleInterest(data = {}) {
  const vehicle = data.veiculo_interesse || {};
  return Boolean(
    vehicle.marca
    || vehicle.modelo
    || vehicle.marca_id
    || vehicle.modelo_id
    || vehicle.marca_outro
    || vehicle.modelo_outro
    || vehicle.versao_id
    || vehicle.versao_outro
    || vehicle.versao
    || vehicle.ano
    || vehicle.categoria_veiculo_id
    || vehicle.condicao
    || vehicle.faixa_preco_min
    || vehicle.faixa_preco_max
    || vehicle.cor_preferida
    || vehicle.combustivel
    || vehicle.cambio
    || vehicle.observacoes
    || data.modelo_interesse
  );
}

function mapEventoPayload(data = {}, lead) {
  if (data.status === 'concluida' && !data.resultado) {
    throw new Error('Informe o resultado para concluir a atividade.');
  }

  if (data.status === 'concluida' && data.resultado === 'lead_perdido' && !String(data.motivo_resultado || '').trim()) {
    throw new Error('Informe o motivo da perda para concluir a atividade.');
  }

  const targetLeadStatus = data.status === 'concluida' ? RESULTADO_LEAD_STATUS_TARGET[data.resultado] : null;
  const willTransitionLead = Boolean(targetLeadStatus) && isLeadEligibleForResultado(data.resultado, lead?.status);
  const targetRequirement = willTransitionLead ? LEAD_STATUS_REQUIREMENTS[targetLeadStatus] : null;

  if (targetRequirement?.motivo && !data.motivo_status_id) {
    throw new Error('Selecione um motivo para concluir esta atividade.');
  }

  if (targetRequirement?.fields.includes('previsao_fechamento') && !data.previsao_fechamento) {
    throw new Error('Informe a previsao de fechamento para concluir esta atividade.');
  }

  return {
    lead_id: data.lead_id,
    cliente_id: lead?.cliente_id || data.cliente_id,
    titulo: data.titulo || '',
    status: data.status || 'planejada',
    tipo_atendimento: data.tipo_evento || data.tipo_atendimento || 'ligacao',
    temperatura: data.temperatura || 'morno',
    proximo_contato: data.proximo_contato || null,
    observacoes: data.observacoes || null,
    resultado: data.status === 'concluida' ? (data.resultado || null) : null,
    motivo_resultado: data.status === 'concluida' && data.resultado === 'lead_perdido'
      ? String(data.motivo_resultado || '').trim()
      : null,
    motivo_status_id: targetRequirement?.motivo ? data.motivo_status_id : null,
    previsao_fechamento: targetRequirement?.fields.includes('previsao_fechamento') ? data.previsao_fechamento : null,
  };
}

function isTerminalActivityResult(result) {
  return ['venda_realizada', 'lead_perdido'].includes(result);
}

async function addHistoricoAtendimento(entry) {
  const payload = {
    cliente_id: entry.cliente_id,
    lead_id: entry.lead_id || null,
    atendimento_id: entry.atendimento_id || (entry.entidade === 'Evento' ? entry.entidade_id : null),
    tipo: entry.tipo,
    descricao: entry.descricao,
    entidade: entry.entidade || null,
    entidade_id: entry.entidade_id || null,
    status: entry.status || null,
    metadados: entry.metadados || {},
  };

  const row = await crmApi.historico_atendimentos.create(payload);
  return mapHistoricoRow(row);
}

async function uploadLeadAttachment({ lead, file }) {
  assertSupabaseConfigured();

  if (!lead?.id || !lead?.cliente_id) {
    throw new Error('Anexo deve estar vinculado a um lead salvo.');
  }

  if (!file) {
    throw new Error('Selecione um arquivo para anexar.');
  }

  const safeName = sanitizeFileName(file.name);
  const path = `leads/${lead.id}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(CRM_ATTACHMENTS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) {
    throw toError(error, 'Nao foi possivel enviar o anexo.');
  }

  return addHistoricoAtendimento({
    cliente_id: lead.cliente_id,
    lead_id: lead.id,
    tipo: 'observacao',
    descricao: file.name || safeName,
    entidade: 'Lead',
    entidade_id: lead.id,
    status: lead.status,
    metadados: {
      origem: 'lead_attachment',
      bucket: CRM_ATTACHMENTS_BUCKET,
      path,
      nome: file.name || safeName,
      tipo: file.type || 'application/octet-stream',
      tamanho: file.size || 0,
    },
  });
}

async function openAttachment(attachment) {
  assertSupabaseConfigured();

  const bucket = attachment?.metadados?.bucket || CRM_ATTACHMENTS_BUCKET;
  const path = attachment?.metadados?.path;

  if (!path) {
    throw new Error('Anexo sem caminho de arquivo.');
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60);

  if (error) {
    throw toError(error, 'Nao foi possivel abrir o anexo.');
  }

  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  return data.signedUrl;
}

async function deleteAttachment(attachment) {
  assertSupabaseConfigured();

  const bucket = attachment?.metadados?.bucket || CRM_ATTACHMENTS_BUCKET;
  const path = attachment?.metadados?.path;

  if (!attachment?.id) {
    throw new Error('Anexo sem registro para excluir.');
  }

  if (path) {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (error) {
      throw toError(error, 'Nao foi possivel excluir o arquivo do anexo.');
    }
  }

  await crmApi.historico_atendimentos.remove(attachment.id);
  return true;
}

async function findClienteByContact({ telefone, email }) {
  const phone = normalizePhone(telefone);
  const normalizedEmail = normalizeEmail(email);
  const filters = [`telefone_normalizado.eq.${phone}`];

  if (normalizedEmail) {
    filters.push(`email_normalizado.eq.${normalizedEmail}`);
  }

  const rows = await crmApi.clientes.list({
    or: filters.join(','),
    limit: 1,
  });
  return rows?.[0] || null;
}

async function upsertCliente(data = {}) {
  const payload = mapClientePayload(data);
  const existing = await findClienteByContact(payload);

  if (existing) {
    const row = await crmApi.clientes.update(existing.id, {
      ...payload,
      nome: payload.nome || existing.nome,
      email: payload.email || existing.email,
      email_normalizado: payload.email_normalizado || existing.email_normalizado,
      status_relacionamento: payload.status_relacionamento || existing.status_relacionamento,
    });
    return mapClienteRow(row);
  }

  const row = await crmApi.clientes.create(payload);
  return mapClienteRow(row);
}

async function getLead(id) {
  const row = await crmApi.leads.getById(id);
  return mapLeadRow(row);
}

function createListRepository(entityName, entityApi, mapper) {

  return {
    async list(orderBy = '-created_date', limit = 100) {
      const parsed = parseSort(orderBy);
      const rows = await entityApi.list({
        orderBy: parsed.field,
        ascending: parsed.ascending,
        limit,
      });
      return rows.map(mapper);
    },

    async listPage(options = {}) {
      const parsed = parseSort(options.orderBy || '-created_date');
      const result = await entityApi.listPage({
        ...options,
        orderBy: parsed.field,
        ascending: parsed.ascending,
        limit: options.limit || options.pageSize || 50,
      });

      return {
        ...result,
        rows: result.rows.map(mapper),
      };
    },

    async delete(id) {
      return entityApi.remove(id);
    },
  };
}

const ClienteRepository = {
  ...createListRepository('Cliente', crmApi.clientes, mapClienteRow),

  async create(data) {
    return upsertCliente(data);
  },

  async update(id, data) {
    const payload = mapClientePayload(data);
    const row = await crmApi.clientes.update(id, payload);

    await addHistoricoAtendimento({
      cliente_id: id,
      tipo: 'observacao',
      descricao: 'Cadastro do cliente atualizado.',
      entidade: 'Cliente',
      entidade_id: id,
      status: row.status_relacionamento,
    });

    return mapClienteRow(row);
  },
};

const LeadRepository = {
  ...createListRepository('Lead', crmApi.leads, mapLeadRow),

  async get(id) {
    return getLead(id);
  },

  async create(data) {
    const clientePayload = mapClientePayload({
      nome: data.nome,
      telefone: data.telefone,
      email: data.email,
      empresa: data.empresa,
      status_relacionamento: data.status === 'convertido' ? 'cliente' : 'lead',
    });
    const leadPayload = mapLeadPayload(data);
    const vehiclePayload = hasVehicleInterest(data) ? mapVeiculoInteressePayload(data) : null;

    const result = await crmApi.leads.saveFull({
      leadId: null,
      clientePayload,
      leadPayload,
      vehiclePayload,
      vehicleId: null,
      historico: {
        tipo: 'entrada_lead',
        descricao: `Lead criado na central: ${leadPayload.nome}`,
      },
    });

    let lead = mapLeadRow(result.lead);
    if (result.vehicle) {
      const vehicle = mapVeiculoInteresseRow(result.vehicle);
      lead = {
        ...lead,
        veiculo_interesse: vehicle,
        modelo_interesse: formatVehicleLabel(vehicle) || lead.modelo_interesse,
      };
    }

    return lead;
  },

  async update(id, data) {
    const current = await getLead(id);
    const nextData = { ...current, ...data };
    const clientePayload = mapClientePayload({
      nome: nextData.nome,
      telefone: nextData.telefone,
      email: nextData.email,
      empresa: nextData.empresa,
      status_relacionamento: nextData.status === 'convertido' ? 'cliente' : 'lead',
    });
    const leadPayload = mapLeadPayload(nextData);
    const vehiclePayload = hasVehicleInterest(data) ? mapVeiculoInteressePayload(data, id) : null;

    const result = await crmApi.leads.saveFull({
      leadId: id,
      clientePayload,
      leadPayload,
      vehiclePayload,
      vehicleId: data.veiculo_interesse?.id || null,
    });

    let lead = mapLeadRow(result.lead);
    if (result.vehicle) {
      const vehicle = mapVeiculoInteresseRow(result.vehicle);
      lead = {
        ...lead,
        veiculo_interesse: vehicle,
        modelo_interesse: formatVehicleLabel(vehicle) || lead.modelo_interesse,
      };
    }

    return lead;
  },

};

const VeiculoInteresseRepository = {
  ...createListRepository('VeiculoInteresse', crmApi.veiculos_interesse, mapVeiculoInteresseRow),

  async create(data) {
    const row = await crmApi.veiculos_interesse.create(mapVeiculoInteressePayload({ veiculo_interesse: data }, data.lead_id));
    return mapVeiculoInteresseRow(row);
  },

  async update(id, data) {
    const row = await crmApi.veiculos_interesse.update(id, mapVeiculoInteressePayload({ veiculo_interesse: data }, data.lead_id));
    return mapVeiculoInteresseRow(row);
  },
};

const CategoriaVeiculoRepository = {
  ...createListRepository('CategoriaVeiculo', crmApi.categorias_veiculo, mapCategoriaVeiculoRow),

  async create(data) {
    const row = await crmApi.categorias_veiculo.create({
      nome: data.nome,
      ativo: data.ativo !== false,
      campos_extra: Array.isArray(data.campos_extra) ? data.campos_extra : [],
    });
    return mapCategoriaVeiculoRow(row);
  },

  async update(id, data) {
    const row = await crmApi.categorias_veiculo.update(id, {
      nome: data.nome,
      ativo: data.ativo !== false,
      campos_extra: Array.isArray(data.campos_extra) ? data.campos_extra : [],
    });
    return mapCategoriaVeiculoRow(row);
  },
};

const OrigemLeadRepository = {
  ...createListRepository('OrigemLead', crmApi.origens_lead, mapOrigemLeadRow),

  async create(data) {
    const row = await crmApi.origens_lead.create({ nome: data.nome, ativo: data.ativo !== false });
    return mapOrigemLeadRow(row);
  },

  async update(id, data) {
    const row = await crmApi.origens_lead.update(id, { nome: data.nome, ativo: data.ativo !== false });
    return mapOrigemLeadRow(row);
  },
};

const MotivoStatusRepository = {
  ...createListRepository('MotivoStatus', crmApi.motivos_status, mapMotivoStatusRow),

  async create(data) {
    const row = await crmApi.motivos_status.create({ status: data.status, nome: data.nome, ativo: data.ativo !== false });
    return mapMotivoStatusRow(row);
  },

  async update(id, data) {
    const row = await crmApi.motivos_status.update(id, { status: data.status, nome: data.nome, ativo: data.ativo !== false });
    return mapMotivoStatusRow(row);
  },
};

const PipelineRepository = {
  ...createListRepository('Pipeline', crmApi.pipelines, mapPipelineRow),

  async create(data) {
    const row = await crmApi.pipelines.create({ nome: data.nome, padrao: data.padrao === true, ativo: data.ativo !== false });
    return mapPipelineRow(row);
  },

  async update(id, data) {
    const row = await crmApi.pipelines.update(id, { nome: data.nome, padrao: data.padrao === true, ativo: data.ativo !== false });
    return mapPipelineRow(row);
  },
};

const EtapaPipelineRepository = {
  ...createListRepository('EtapaPipeline', crmApi.etapas_pipeline, mapEtapaPipelineRow),

  async create(data) {
    const row = await crmApi.etapas_pipeline.create({
      pipeline_id: data.pipeline_id,
      nome: data.nome,
      cor: data.cor || '#90CAF9',
      ordem: data.ordem ?? 0,
      ativo: data.ativo !== false,
    });
    return mapEtapaPipelineRow(row);
  },

  async update(id, data) {
    const row = await crmApi.etapas_pipeline.update(id, {
      pipeline_id: data.pipeline_id,
      nome: data.nome,
      cor: data.cor,
      ordem: data.ordem,
      ativo: data.ativo !== false,
    });
    return mapEtapaPipelineRow(row);
  },
};

const MarcaVeiculoRepository = {
  ...createListRepository('MarcaVeiculo', crmApi.marcas_veiculo, mapMarcaVeiculoRow),

  async create(data) {
    const row = await crmApi.marcas_veiculo.create({ nome: data.nome, ativo: data.ativo !== false });
    return mapMarcaVeiculoRow(row);
  },

  async update(id, data) {
    const row = await crmApi.marcas_veiculo.update(id, { nome: data.nome, ativo: data.ativo !== false });
    return mapMarcaVeiculoRow(row);
  },
};

const ModeloVeiculoRepository = {
  ...createListRepository('ModeloVeiculo', crmApi.modelos_veiculo, mapModeloVeiculoRow),

  async create(data) {
    const row = await crmApi.modelos_veiculo.create({
      marca_id: data.marca_id,
      categoria_veiculo_id: data.categoria_veiculo_id,
      nome: data.nome,
      ativo: data.ativo !== false,
      ano_inicio: data.ano_inicio ?? null,
      ano_fim: data.ano_fim ?? null,
    });
    return mapModeloVeiculoRow(row);
  },

  async update(id, data) {
    const row = await crmApi.modelos_veiculo.update(id, {
      marca_id: data.marca_id,
      categoria_veiculo_id: data.categoria_veiculo_id,
      nome: data.nome,
      ativo: data.ativo !== false,
      ano_inicio: data.ano_inicio ?? null,
      ano_fim: data.ano_fim ?? null,
    });
    return mapModeloVeiculoRow(row);
  },
};

const VersaoVeiculoRepository = {
  ...createListRepository('VersaoVeiculo', crmApi.versoes_veiculo, mapVersaoVeiculoRow),

  async create(data) {
    const row = await crmApi.versoes_veiculo.create({
      modelo_id: data.modelo_id,
      nome: data.nome,
      ativo: data.ativo !== false,
    });
    return mapVersaoVeiculoRow(row);
  },

  async update(id, data) {
    const row = await crmApi.versoes_veiculo.update(id, {
      modelo_id: data.modelo_id,
      nome: data.nome,
      ativo: data.ativo !== false,
    });
    return mapVersaoVeiculoRow(row);
  },
};

const VeiculoEstoqueRepository = {
  ...createListRepository('VeiculoEstoque', crmApi.veiculos_estoque, mapVeiculoEstoqueRow),

  async create(data) {
    const result = await crmApi.veiculos_estoque.saveFull({
      estoqueId: null,
      veiculoPayload: {
        modelo_id: data.modelo_id || null,
        versao_id: data.versao_id || null,
        chassi: data.chassi,
        placa: data.placa || null,
        cor: data.cor || null,
        km: data.km || null,
      },
      estoquePayload: {
        condicao: data.condicao || 'novo',
        status: data.status || 'disponivel',
        preco: data.preco || null,
        observacoes: data.observacoes || null,
      },
    });
    return mapVeiculoEstoqueRow({ ...result.estoque, veiculo: result.veiculo });
  },

  async update(id, data) {
    const result = await crmApi.veiculos_estoque.saveFull({
      estoqueId: id,
      veiculoPayload: {
        modelo_id: data.modelo_id || null,
        versao_id: data.versao_id || null,
        chassi: data.chassi,
        placa: data.placa || null,
        cor: data.cor || null,
        km: data.km || null,
      },
      estoquePayload: {
        condicao: data.condicao || 'novo',
        status: data.status || 'disponivel',
        preco: data.preco || null,
        observacoes: data.observacoes || null,
      },
    });
    return mapVeiculoEstoqueRow({ ...result.estoque, veiculo: result.veiculo });
  },
};

function mapPropostaRow(row = {}) {
  return {
    id: row.id,
    lead_id: row.lead_id || '',
    cliente_id: row.cliente_id || '',
    veiculo_estoque_id: row.veiculo_estoque_id || '',
    veiculo_descricao: row.veiculo_descricao || '',
    valor_veiculo: row.valor_veiculo ?? '',
    desconto_valor: row.desconto_valor ?? 0,
    valor_final: row.valor_final ?? '',
    forma_pagamento: row.forma_pagamento || 'a_vista',
    valor_entrada: row.valor_entrada ?? '',
    status: row.status || 'rascunho',
    vendedor_id: row.vendedor_id || '',
    validade_ate: normalizeDateOnly(row.validade_ate),
    observacoes: row.observacoes || '',
    aceita_em: row.aceita_em || null,
    recusada_em: row.recusada_em || null,
    ...mapBaseDates(row),
  };
}

function mapVendaRow(row = {}) {
  return {
    id: row.id,
    proposta_id: row.proposta_id || null,
    lead_id: row.lead_id || '',
    cliente_id: row.cliente_id || '',
    veiculo_estoque_id: row.veiculo_estoque_id || '',
    vendedor_id: row.vendedor_id || '',
    valor_final: row.valor_final ?? '',
    forma_pagamento: row.forma_pagamento || 'a_vista',
    desconto_valor: row.desconto_valor ?? 0,
    data_venda: normalizeDateOnly(row.data_venda),
    motivo_status_id: row.motivo_status_id || '',
    observacoes: row.observacoes || '',
    ...mapBaseDates(row),
  };
}

function mapPropostaPayload(data = {}) {
  const valorVeiculo = toNullableNumber(data.valor_veiculo) ?? 0;
  const descontoValor = toNullableNumber(data.desconto_valor) ?? 0;
  const veiculoEstoqueId = data.veiculo_estoque_id || null;
  const veiculoDescricao = String(data.veiculo_descricao || '').trim();

  if (!veiculoEstoqueId && !veiculoDescricao) {
    throw new Error('Selecione um veiculo do estoque ou descreva o veiculo da proposta.');
  }

  return {
    lead_id: data.lead_id,
    veiculo_estoque_id: veiculoEstoqueId,
    veiculo_descricao: veiculoEstoqueId ? null : veiculoDescricao,
    valor_veiculo: valorVeiculo,
    desconto_valor: descontoValor,
    valor_final: Math.max(valorVeiculo - descontoValor, 0),
    forma_pagamento: data.forma_pagamento || 'a_vista',
    valor_entrada: toNullableNumber(data.valor_entrada),
    status: data.status || 'rascunho',
    vendedor_id: data.vendedor_id || null,
    validade_ate: data.validade_ate || null,
    observacoes: data.observacoes || null,
  };
}

const PropostaRepository = {
  ...createListRepository('Proposta', crmApi.propostas, mapPropostaRow),

  async create(data) {
    if (!data.lead_id) {
      throw new Error('Proposta deve estar vinculada a um lead.');
    }
    const payload = mapPropostaPayload(data);
    const row = await crmApi.propostas.create(payload);
    return mapPropostaRow(row);
  },

  async update(id, data) {
    const payload = mapPropostaPayload(data);
    delete payload.lead_id;
    const row = await crmApi.propostas.update(id, payload);
    return mapPropostaRow(row);
  },

  async recusar(id) {
    const row = await crmApi.propostas.update(id, { status: 'recusada' });
    return mapPropostaRow(row);
  },

  async marcarEnviada(id) {
    const row = await crmApi.propostas.update(id, { status: 'enviada' });
    return mapPropostaRow(row);
  },

  async aceitar(id, vendaData = {}) {
    if (!vendaData.veiculo_estoque_id) {
      throw new Error('Vincule um veiculo do estoque antes de aceitar a proposta.');
    }
    const valorFinal = toNullableNumber(vendaData.valor_final);
    if (!valorFinal) {
      throw new Error('Informe o valor final da venda.');
    }
    if (!vendaData.motivo_status_id) {
      throw new Error('Selecione o motivo de conversao do lead.');
    }

    const result = await crmApi.propostas.acceptProposta({
      propostaId: id,
      vendaPayload: {
        veiculo_estoque_id: vendaData.veiculo_estoque_id,
        vendedor_id: vendaData.vendedor_id || null,
        valor_final: valorFinal,
        forma_pagamento: vendaData.forma_pagamento || 'a_vista',
        desconto_valor: toNullableNumber(vendaData.desconto_valor) ?? 0,
        data_venda: vendaData.data_venda || null,
        motivo_status_id: vendaData.motivo_status_id,
        observacoes: vendaData.observacoes || null,
      },
    });

    return {
      proposta: mapPropostaRow(result.proposta),
      venda: mapVendaRow(result.venda),
    };
  },
};

const VendaRepository = {
  ...createListRepository('Venda', crmApi.vendas, mapVendaRow),

  async closeVenda(data = {}) {
    if (!data.lead_id) {
      throw new Error('Venda deve estar vinculada a um lead.');
    }
    if (!data.veiculo_estoque_id) {
      throw new Error('Selecione o veiculo vendido.');
    }
    const valorFinal = toNullableNumber(data.valor_final);
    if (!valorFinal) {
      throw new Error('Informe o valor final da venda.');
    }
    if (!data.motivo_status_id) {
      throw new Error('Selecione o motivo de conversao do lead.');
    }

    const result = await crmApi.vendas.closeVenda({
      vendaPayload: {
        lead_id: data.lead_id,
        veiculo_estoque_id: data.veiculo_estoque_id,
        vendedor_id: data.vendedor_id || null,
        valor_final: valorFinal,
        forma_pagamento: data.forma_pagamento || 'a_vista',
        desconto_valor: toNullableNumber(data.desconto_valor) ?? 0,
        data_venda: data.data_venda || null,
        motivo_status_id: data.motivo_status_id,
        observacoes: data.observacoes || null,
      },
    });

    return mapVendaRow(result.venda);
  },
};

const ResponsavelRepository = {
  async list() {
    return crmApi.responsaveis.list();
  },
};

const DistribuicaoRepository = {
  async getConfig() {
    return crmApi.distribuicao.getConfig();
  },
  async saveConfig(data) {
    return crmApi.distribuicao.saveConfig(data);
  },
  async clearTestData() {
    return crmApi.distribuicao.clearTestData();
  },
};

const EventoRepository = {
  ...createListRepository('Evento', crmApi.atendimentos, mapEventoRow),

  async create(data) {
    if (!data.lead_id) {
      throw new Error('Atividade deve estar vinculada a um lead.');
    }

    const lead = await getLead(data.lead_id);
    const payload = mapEventoPayload(data, lead);

    const result = await crmApi.atendimentos.saveFull({
      eventoId: null,
      payload,
      historico: {
        tipo: 'atendimento',
        descricao: `${payload.titulo || 'Atividade'} - ${payload.status}`,
      },
    });

    return mapEventoRow(result.evento);
  },

  async update(id, data) {
    const lead = data.lead_id ? await getLead(data.lead_id) : null;
    const payload = mapEventoPayload(data, lead);

    let proximaAtividade = null;
    if (
      data.status === 'concluida'
      && data.resultado
      && !isTerminalActivityResult(data.resultado)
      && data.proxima_atividade?.titulo
      && data.proxima_atividade?.proximo_contato
    ) {
      const nextPayload = mapEventoPayload({
        lead_id: payload.lead_id,
        cliente_id: payload.cliente_id,
        titulo: data.proxima_atividade.titulo,
        status: 'planejada',
        tipo_evento: data.proxima_atividade.tipo_evento || 'ligacao',
        temperatura: data.temperatura || payload.temperatura || 'morno',
        proximo_contato: data.proxima_atividade.proximo_contato,
        observacoes: data.proxima_atividade.observacoes || null,
      }, lead);
      proximaAtividade = {
        payload: nextPayload,
        historico: {
          tipo: 'atendimento',
          descricao: `Proxima atividade planejada: ${nextPayload.titulo}`,
        },
      };
    }

    const result = await crmApi.atendimentos.saveFull({
      eventoId: id,
      payload,
      historico: {
        tipo: 'atendimento',
        descricao: `${payload.titulo || 'Atividade'} - ${payload.status}`,
      },
      proximaAtividade,
    });

    return mapEventoRow(result.evento);
  },
};

const HistoricoAtendimentoRepository = {
  ...createListRepository(
    'HistoricoAtendimento',
    crmApi.historico_atendimentos,
    mapHistoricoRow,
  ),

  async create(data) {
    return addHistoricoAtendimento(data);
  },

  async uploadLeadAttachment(data) {
    return uploadLeadAttachment(data);
  },

  async openAttachment(attachment) {
    return openAttachment(attachment);
  },

  async deleteAttachment(attachment) {
    return deleteAttachment(attachment);
  },
};

export const crmDataClient = {
  entities: {
    Cliente: ClienteRepository,
    Evento: EventoRepository,
    Atividade: EventoRepository,
    HistoricoAtendimento: HistoricoAtendimentoRepository,
    Lead: LeadRepository,
    Responsavel: ResponsavelRepository,
    Distribuicao: DistribuicaoRepository,
    VeiculoInteresse: VeiculoInteresseRepository,
    CategoriaVeiculo: CategoriaVeiculoRepository,
    OrigemLead: OrigemLeadRepository,
    MotivoStatus: MotivoStatusRepository,
    Pipeline: PipelineRepository,
    EtapaPipeline: EtapaPipelineRepository,
    MarcaVeiculo: MarcaVeiculoRepository,
    ModeloVeiculo: ModeloVeiculoRepository,
    VersaoVeiculo: VersaoVeiculoRepository,
    VeiculoEstoque: VeiculoEstoqueRepository,
    Proposta: PropostaRepository,
    Venda: VendaRepository,
  },
};
