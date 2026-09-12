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
  negociacao: { motivo: false, fields: ['previsao_fechamento'] },
  convertido: { motivo: true, fields: [] },
  perdido: { motivo: true, fields: [] },
};
