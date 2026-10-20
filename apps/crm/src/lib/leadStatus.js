// Paleta de cor por `chave_sistema` da etapa (vocabulario fixo: novo/tentativa_contato/
// em_contato/qualificado/negociacao/convertido/perdido) -- independente da antiga coluna
// leads.status (removida na fase 2.6), usada por getEtapaVisual() a partir de etapa.chave_sistema.
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

// ---------------------------------------------------------------------------------------
// Etapas do pipeline (gestao_crm.etapas_pipeline) -- Fase 2.5 do PLANO_LEADS_PIPELINE.
// O lead e posicionado por etapa_id/etapa_tipo; leads.status foi removida (fase 2.6,
// 20261015120000_crm_corte_leads_status.sql). As regras abaixo espelham o backend:
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

// Alvo de venda_realizada/lead_perdido: etapa de sistema (chave_sistema) do pipeline do lead,
// nao configuravel por pipeline_automacoes (fase 2.7) -- qualquer pipeline so tem uma nocao de
// "ganho"/"perdido" por tipo, entao nao faz sentido ser por-pipeline.
const RESULTADO_ETAPA_CHAVE_FIXA = {
  venda_realizada: 'convertido',
  lead_perdido: 'perdido',
};

const RESULTADO_ETAPA_TIPO_FALLBACK = {
  venda_realizada: 'ganho',
  lead_perdido: 'perdido',
};

// Motivo exigido para o lead permanecer/entrar nesta etapa: sempre em ganho/perdido (por tipo,
// nao configuravel); nas demais, so se a etapa tiver `exige_motivo` marcado na tela de Pipelines
// (fase 2.7 -- antes disso, exigia so na etapa de sistema 'qualificado').
export function etapaMotivoAplicaEm(etapa) {
  if (!etapa) return null;
  if (etapa.tipo === 'ganho' || etapa.tipo === 'perdido') return etapa.tipo;
  if (etapa.exige_motivo) return 'qualificado';
  return null;
}

export function etapaExigeMotivo(etapa) {
  return Boolean(etapaMotivoAplicaEm(etapa));
}

export function isEtapaEmAndamento(etapa) {
  return etapa?.tipo === 'em_andamento';
}

export function isLeadAtivo(lead) {
  return lead?.etapa_tipo === 'em_andamento';
}

export function findEtapaDoLead(etapas = [], lead) {
  if (!lead) return null;
  return etapas.find((etapa) => etapa.id === lead.etapa_id) || null;
}

export function getLeadEtapaLabel(etapas = [], lead) {
  if (!lead) return '';
  return findEtapaDoLead(etapas, lead)?.nome || ETAPA_TIPO_LABEL[lead.etapa_tipo] || lead.etapa_tipo || '';
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

// Paleta generica por etapa_tipo, usada so quando a etapa especifica nao foi resolvida
// (lista de etapas ainda carregando, ou etapa_id fora do pipeline carregado).
const ETAPA_TIPO_BADGE = {
  em_andamento: LEAD_STATUS_BADGE.novo,
  ganho: LEAD_STATUS_BADGE.convertido,
  perdido: LEAD_STATUS_BADGE.perdido,
};
const ETAPA_TIPO_STYLE = {
  em_andamento: LEAD_STATUS_STYLE.novo,
  ganho: LEAD_STATUS_STYLE.convertido,
  perdido: LEAD_STATUS_STYLE.perdido,
};

// Visual do badge da etapa. Etapa de sistema mantem as classes de sempre; etapa livre usa a
// cor cadastrada no pipeline. variant: 'badge' (solido) ou 'style' (borda + fundo claro).
export function getEtapaVisual(etapa, { variant = 'badge', etapaTipo } = {}) {
  const classes = variant === 'style' ? LEAD_STATUS_STYLE : LEAD_STATUS_BADGE;
  const chave = etapa?.chave_sistema;
  if (chave && classes[chave]) return { className: classes[chave], style: undefined };
  if (!etapa) {
    const tipoClasses = variant === 'style' ? ETAPA_TIPO_STYLE : ETAPA_TIPO_BADGE;
    return { className: tipoClasses[etapaTipo] || tipoClasses.em_andamento, style: undefined };
  }

  if (variant === 'style') {
    return {
      className: 'border',
      style: { borderColor: etapa.cor, backgroundColor: `${etapa.cor}22`, color: '#1a1a1a' },
    };
  }
  return { className: '', style: { backgroundColor: etapa.cor, color: readableTextColor(etapa.cor) } };
}

// Etapa que a conclusao da atividade com este resultado busca no pipeline (mesma busca de
// apply_activity_outcome): venda/perdido pela etapa de sistema (fallback 1a etapa ativa do
// tipo); os demais resultados pela automacao configurada em Pipelines (fase 2.7) -- sem
// automacao cadastrada para o pipeline, retorna null (o resultado nao move o lead).
export function resolveEtapaAlvoResultado(resultado, etapas = [], automacoes = []) {
  const chave = RESULTADO_ETAPA_CHAVE_FIXA[resultado];
  if (chave) {
    const porChave = etapas.find((etapa) => etapa.chave_sistema === chave);
    if (porChave) return porChave;
    const tipo = RESULTADO_ETAPA_TIPO_FALLBACK[resultado];
    return [...etapas]
      .filter((etapa) => etapa.tipo === tipo && etapa.ativo !== false)
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))[0] || null;
  }
  const automacao = automacoes.find((item) => item.resultado === resultado);
  if (!automacao) return null;
  return etapas.find((etapa) => etapa.id === automacao.etapa_destino_id) || null;
}

// Replica a elegibilidade de apply_activity_outcome: venda/perdido de qualquer etapa; os
// demais so com etapa atual em_andamento e ordem <= ordem do alvo.
export function isLeadEligibleForResultadoEtapa(resultado, etapaAtual, etapas = [], automacoes = []) {
  const alvo = resolveEtapaAlvoResultado(resultado, etapas, automacoes);
  if (!alvo) return false;
  if (resultado in RESULTADO_ETAPA_TIPO_FALLBACK) return true;
  return isEtapaEmAndamento(etapaAtual) && Number(etapaAtual.ordem) <= Number(alvo.ordem);
}

// Nivel 3 (item 7) da auditoria do CRM (2026-10-20): decisao pura do drag-and-drop do Kanban
// (Leads.jsx, handleDragEnd), extraida pra ser testavel sem montar o componente inteiro (mocks de
// ~15 queries/mutations). Mesmo comportamento de antes, so sem os setState/mutate inline.
export function resolveLeadDragAction(result, etapas = [], leads = []) {
  if (!result?.destination) return { type: 'noop' };
  const { draggableId, destination } = result;
  const etapa = etapas.find((item) => item.id === destination.droppableId);
  const lead = leads.find((item) => item.id === draggableId);
  if (!lead || !etapa || findEtapaDoLead(etapas, lead)?.id === etapa.id) return { type: 'noop' };

  if (etapaMotivoAplicaEm(etapa)) {
    return { type: 'require_motivo', lead, etapa };
  }
  return { type: 'move', lead, etapa };
}

// Sugestao de etapa inicial ao trocar o lead de pipeline (Leads.jsx, dialogo "Mudar de
// pipeline"): etapa_inicial_id do pipeline escolhido, com fallback pra 1a etapa em_andamento
// ativa por ordem (mesma regra do banco, sync_lead_etapa_status).
export function resolveEtapaInicialSugerida(etapasEmAndamento = [], etapaInicialId) {
  return etapasEmAndamento.find((item) => item.id === etapaInicialId) || etapasEmAndamento[0] || null;
}

// Validacao do dialogo "Mudar de pipeline" (Leads.jsx, canSubmitMove): exige lead, pipeline e
// etapa de destino escolhidos, e motivo quando a etapa de destino exigir.
export function canSubmitLeadPipelineMove({ hasTarget, pipelineId, etapaId, etapaDestino, motivoId }) {
  const motivoAplicaEm = etapaDestino ? etapaMotivoAplicaEm(etapaDestino) : null;
  return Boolean(hasTarget) && Boolean(pipelineId) && Boolean(etapaId) && (!motivoAplicaEm || Boolean(motivoId));
}

// Motivo (aplica_em) exigido ao concluir a atividade, ou null. Espelha
// prepare_activity_business_state: venda/perdido sempre; demais resultados so quando a etapa
// destino da automacao exige motivo e a atividade realmente vai mover o lead pra la.
export function resultadoMotivoAplicaEm(resultado, etapaAtual, etapas = [], automacoes = []) {
  if (resultado === 'venda_realizada') return 'ganho';
  if (resultado === 'lead_perdido') return 'perdido';
  const alvo = resolveEtapaAlvoResultado(resultado, etapas, automacoes);
  if (!alvo || !alvo.exige_motivo) return null;
  return isLeadEligibleForResultadoEtapa(resultado, etapaAtual, etapas, automacoes) ? 'qualificado' : null;
}
