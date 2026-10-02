export const LEAD_STATUS = [
  'novo',
  'tentativa_contato',
  'em_contato',
  'qualificado',
  'negociacao',
  'convertido',
  'perdido',
];

export const LEAD_STATUS_LABEL = {
  novo: 'Novo',
  tentativa_contato: 'Tentativa de contato',
  em_contato: 'Em contato',
  qualificado: 'Qualificado',
  negociacao: 'Negociação',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

export const LEAD_STATUS_STYLE = {
  novo: 'border-blue-200 bg-blue-50 text-blue-700',
  tentativa_contato: 'border-amber-200 bg-amber-50 text-amber-700',
  em_contato: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  qualificado: 'border-violet-200 bg-violet-50 text-violet-700',
  negociacao: 'border-orange-200 bg-orange-50 text-orange-700',
  convertido: 'border-green-200 bg-green-50 text-green-700',
  perdido: 'border-red-200 bg-red-50 text-red-700',
};

export const LEAD_STATUS_BADGE = {
  novo: 'bg-blue-600 text-white',
  tentativa_contato: 'bg-amber-500 text-white',
  em_contato: 'bg-cyan-600 text-white',
  qualificado: 'bg-violet-600 text-white',
  negociacao: 'bg-orange-500 text-white',
  convertido: 'bg-green-600 text-white',
  perdido: 'bg-red-600 text-white',
};

export const ACTIVE_LEAD_STATUSES = ['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao'];

// Status que exigem justificativa antes do lead avancar. `motivo: true` exige selecionar
// um gestao_crm.motivos_status (catalogo) cadastrado para aquele status; `fields` lista
// colunas do lead que ja existem no cadastro e que precisam estar preenchidas. Aplicado
// tanto no Kanban (drag-and-drop) quanto no formulario de edicao do lead; o backend
// (trigger gestao_crm.prepare_lead_phase1) reforca a mesma regra.
export const LEAD_STATUS_REQUIREMENTS = {
  qualificado: { motivo: true, fields: [] },
  negociacao: { motivo: false, fields: [] },
  convertido: { motivo: true, fields: [] },
  perdido: { motivo: true, fields: [] },
};

// Resultado de gestao_crm.atendimentos -> status de lead que a conclusao da atividade
// provoca (gestao_crm.apply_activity_outcome()). Usado para decidir, no formulario de
// conclusao de atividade (EventoForm), quando exigir motivo -- mesma exigencia de
// LEAD_STATUS_REQUIREMENTS, so que disparada pelo resultado do atendimento em vez de
// uma mudanca manual de status no Kanban/LeadForm.
export const RESULTADO_LEAD_STATUS_TARGET = {
  venda_realizada: 'convertido',
  lead_perdido: 'perdido',
  proposta_enviada: 'negociacao',
  visita_agendada: 'qualificado',
  test_drive: 'qualificado',
};

// Guard de elegibilidade: replica o WHERE de gestao_crm.apply_activity_outcome() --
// a transicao (e portanto a exigencia de motivo/previsao) so ocorre se o lead ainda
// estiver num status "anterior" ao alvo. Se o lead ja passou do alvo, o UPDATE do
// trigger e um no-op e nada e exigido.
const RESULTADO_ELIGIBLE_LEAD_STATUSES = {
  venda_realizada: null, // sempre roda, independente do status atual
  lead_perdido: null, // sempre roda, independente do status atual
  proposta_enviada: ['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao'],
  visita_agendada: ['novo', 'tentativa_contato', 'em_contato', 'qualificado'],
  test_drive: ['novo', 'tentativa_contato', 'em_contato', 'qualificado'],
};

export function isLeadEligibleForResultado(resultado, leadStatus) {
  if (!(resultado in RESULTADO_ELIGIBLE_LEAD_STATUSES)) return false;
  const eligibleStatuses = RESULTADO_ELIGIBLE_LEAD_STATUSES[resultado];
  if (eligibleStatuses === null) return true;
  return eligibleStatuses.includes(leadStatus);
}

// ---------------------------------------------------------------------------------------
// Etapas do pipeline (gestao_crm.etapas_pipeline) -- Fase 2.5 do PLANO_LEADS_PIPELINE.
// O lead passa a ser posicionado por etapa_id; leads.status continua como espelho
// (derivado da etapa no banco). As regras abaixo espelham o backend:
//   - prepare_lead_phase1()            -> etapaMotivoAplicaEm / etapaExigeMotivo
//   - apply_activity_outcome()         -> RESULTADO_ETAPA_CHAVE / resolveEtapaAlvoResultado /
//                                         isLeadEligibleForResultadoEtapa
//   - prepare_activity_business_state() -> resultadoExigeMotivo
// Os helpers aceitam etapas no formato de mapEtapaPipelineRow (id, nome, cor, ordem, tipo,
// chave_sistema, ativo). Sem etapas carregadas, caem no comportamento antigo por status.
// ---------------------------------------------------------------------------------------

export const ETAPA_TIPO_LABEL = {
  em_andamento: 'Em andamento',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

export const MOTIVO_APLICA_EM_LABEL = {
  qualificado: 'Qualificado',
  ganho: 'Convertido',
  perdido: 'Perdido',
};

// Etapa de sistema (chave_sistema) que cada resultado de atividade busca no pipeline do lead.
export const RESULTADO_ETAPA_CHAVE = {
  venda_realizada: 'convertido',
  lead_perdido: 'perdido',
  proposta_enviada: 'negociacao',
  visita_agendada: 'qualificado',
  test_drive: 'qualificado',
  contato_realizado: 'em_contato',
  sem_resposta: 'tentativa_contato',
};

const RESULTADO_ETAPA_TIPO_FALLBACK = {
  venda_realizada: 'ganho',
  lead_perdido: 'perdido',
};

const STATUS_TIPO = { convertido: 'ganho', perdido: 'perdido' };

export function etapaTipoFromStatus(status) {
  return STATUS_TIPO[status] || 'em_andamento';
}

export function etapaMotivoAplicaEm(etapa) {
  if (!etapa) return null;
  if (etapa.tipo === 'ganho' || etapa.tipo === 'perdido') return etapa.tipo;
  if (etapa.chave_sistema === 'qualificado') return 'qualificado';
  return null;
}

export function etapaExigeMotivo(etapa) {
  return Boolean(etapaMotivoAplicaEm(etapa));
}

export function isEtapaEmAndamento(etapa) {
  return etapa?.tipo === 'em_andamento';
}

export function isLeadAtivo(lead) {
  if (!lead) return false;
  if (lead.etapa_tipo) return lead.etapa_tipo === 'em_andamento';
  return ACTIVE_LEAD_STATUSES.includes(lead.status);
}

export function findEtapaDoLead(etapas = [], lead) {
  if (!lead) return null;
  return etapas.find((etapa) => etapa.id === lead.etapa_id)
    || etapas.find((etapa) => etapa.chave_sistema && etapa.chave_sistema === lead.status)
    || null;
}

export function getLeadEtapaLabel(etapas = [], lead) {
  if (!lead) return '';
  return findEtapaDoLead(etapas, lead)?.nome || LEAD_STATUS_LABEL[lead.status] || lead.status || '';
}

function hexToRgb(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function readableTextColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

// Visual do badge da etapa. Etapa de sistema mantem as classes de sempre; etapa livre usa a
// cor cadastrada no pipeline. variant: 'badge' (solido) ou 'style' (borda + fundo claro).
export function getEtapaVisual(etapa, { variant = 'badge', status } = {}) {
  const chave = etapa?.chave_sistema || (!etapa ? status : null);
  const classes = variant === 'style' ? LEAD_STATUS_STYLE : LEAD_STATUS_BADGE;
  if (chave && classes[chave]) return { className: classes[chave], style: undefined };
  if (!etapa) return { className: classes.novo, style: undefined };

  if (variant === 'style') {
    return {
      className: 'border',
      style: { borderColor: etapa.cor, backgroundColor: `${etapa.cor}22`, color: '#1a1a1a' },
    };
  }
  return { className: '', style: { backgroundColor: etapa.cor, color: readableTextColor(etapa.cor) } };
}

// Etapa que a conclusao da atividade com este resultado busca no pipeline (mesma busca de
// apply_activity_outcome): etapa de sistema; venda/perdido caem na 1a etapa ativa do tipo.
export function resolveEtapaAlvoResultado(resultado, etapas = []) {
  const chave = RESULTADO_ETAPA_CHAVE[resultado];
  if (!chave) return null;
  const porChave = etapas.find((etapa) => etapa.chave_sistema === chave);
  if (porChave) return porChave;
  const tipo = RESULTADO_ETAPA_TIPO_FALLBACK[resultado];
  if (!tipo) return null;
  return [...etapas]
    .filter((etapa) => etapa.tipo === tipo && etapa.ativo !== false)
    .sort((a, b) => Number(a.ordem) - Number(b.ordem))[0] || null;
}

// Replica a elegibilidade de apply_activity_outcome: venda/perdido de qualquer etapa; os
// demais so com etapa atual em_andamento e ordem <= ordem do alvo.
export function isLeadEligibleForResultadoEtapa(resultado, etapaAtual, etapas = []) {
  if (!(resultado in RESULTADO_ETAPA_CHAVE)) return false;
  const alvo = resolveEtapaAlvoResultado(resultado, etapas);
  if (!alvo) return false;
  if (resultado in RESULTADO_ETAPA_TIPO_FALLBACK) return true;
  return isEtapaEmAndamento(etapaAtual) && Number(etapaAtual.ordem) <= Number(alvo.ordem);
}

// Motivo (aplica_em) exigido ao concluir a atividade, ou null. Espelha
// prepare_activity_business_state: venda/perdido sempre; visita/test_drive so quando a
// atividade vai mover o lead para a etapa qualificado.
export function resultadoMotivoAplicaEm(resultado, etapaAtual, etapas = []) {
  if (resultado === 'venda_realizada') return 'ganho';
  if (resultado === 'lead_perdido') return 'perdido';
  if (resultado === 'visita_agendada' || resultado === 'test_drive') {
    return isLeadEligibleForResultadoEtapa(resultado, etapaAtual, etapas) ? 'qualificado' : null;
  }
  return null;
}
