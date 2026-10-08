import { describe, expect, it } from 'vitest';
import {
  etapaMotivoAplicaEm,
  findEtapaDoLead,
  getEtapaVisual,
  getLeadEtapaLabel,
  isLeadAtivo,
  isLeadEligibleForResultadoEtapa,
  resolveEtapaAlvoResultado,
  resultadoMotivoAplicaEm,
} from '@/lib/leadStatus';

// Regras por etapa do pipeline (Fase 2.5 do PLANO_LEADS_PIPELINE). Espelham as funcoes
// Postgres da Fase 2.2 -- se um lado mudar sem o outro, este teste deve quebrar:
//   prepare_lead_phase1()             -> 20261002160000_crm_prepare_lead_phase1_por_etapa.sql
//   apply_activity_outcome()          -> 20261002170000_crm_apply_activity_outcome_por_etapa.sql
//   prepare_activity_business_state() -> 20261002210000_crm_prepare_activity_business_state_por_etapa.sql

const etapa = (id, ordem, tipo, chave_sistema = null, extra = {}) => ({
  id, nome: id, cor: '#3b82f6', ordem, tipo, chave_sistema, ativo: true, exige_motivo: false, ...extra,
});

const ETAPAS = [
  etapa('novo', 0, 'em_andamento', 'novo'),
  etapa('tentativa', 1, 'em_andamento', 'tentativa_contato'),
  etapa('livre-antes-contato', 1.5, 'em_andamento'),
  etapa('em_contato', 2, 'em_andamento', 'em_contato'),
  etapa('qualificado', 3, 'em_andamento', 'qualificado', { exige_motivo: true }),
  etapa('negociacao', 4, 'em_andamento', 'negociacao'),
  etapa('livre-pos-negoc', 4.5, 'em_andamento'),
  etapa('convertido', 5, 'ganho', 'convertido'),
  etapa('perdido', 6, 'perdido', 'perdido'),
];
const byId = (id) => ETAPAS.find((item) => item.id === id);

// Automacoes (fase 2.7): replica o backfill da migration 20261008130000 para o pipeline
// Comercial -- mesmo mapa resultado -> etapa que antes vinha hardcoded por chave_sistema.
const automacao = (resultado, etapaDestinoId) => ({ resultado, etapa_destino_id: etapaDestinoId });
const AUTOMACOES = [
  automacao('contato_realizado', 'em_contato'),
  automacao('sem_resposta', 'tentativa'),
  automacao('visita_agendada', 'qualificado'),
  automacao('test_drive', 'qualificado'),
  automacao('proposta_enviada', 'negociacao'),
];

describe('etapaMotivoAplicaEm (espelha prepare_lead_phase1)', () => {
  it('exige motivo em qualificado (por chave) e nas etapas de ganho/perdido (por tipo)', () => {
    expect(etapaMotivoAplicaEm(byId('qualificado'))).toBe('qualificado');
    expect(etapaMotivoAplicaEm(byId('convertido'))).toBe('ganho');
    expect(etapaMotivoAplicaEm(byId('perdido'))).toBe('perdido');
    expect(etapaMotivoAplicaEm(etapa('perdido-livre', 7, 'perdido'))).toBe('perdido');
  });

  it('nao exige motivo nas demais etapas em andamento, inclusive livres', () => {
    ['novo', 'tentativa', 'em_contato', 'negociacao', 'livre-antes-contato'].forEach((id) => {
      expect(etapaMotivoAplicaEm(byId(id))).toBeNull();
    });
    expect(etapaMotivoAplicaEm(null)).toBeNull();
  });
});

describe('isLeadEligibleForResultadoEtapa (espelha apply_activity_outcome)', () => {
  it('venda e perdido valem de qualquer etapa', () => {
    ETAPAS.forEach((atual) => {
      expect(isLeadEligibleForResultadoEtapa('venda_realizada', atual, ETAPAS)).toBe(true);
      expect(isLeadEligibleForResultadoEtapa('lead_perdido', atual, ETAPAS)).toBe(true);
    });
  });

  it('demais resultados so com etapa em andamento e ordem <= a do alvo', () => {
    expect(isLeadEligibleForResultadoEtapa('visita_agendada', byId('em_contato'), ETAPAS, AUTOMACOES)).toBe(true);
    expect(isLeadEligibleForResultadoEtapa('test_drive', byId('qualificado'), ETAPAS, AUTOMACOES)).toBe(true);
    expect(isLeadEligibleForResultadoEtapa('visita_agendada', byId('negociacao'), ETAPAS, AUTOMACOES)).toBe(false);
    expect(isLeadEligibleForResultadoEtapa('proposta_enviada', byId('livre-pos-negoc'), ETAPAS, AUTOMACOES)).toBe(false);
    expect(isLeadEligibleForResultadoEtapa('contato_realizado', byId('livre-antes-contato'), ETAPAS, AUTOMACOES)).toBe(true);
    expect(isLeadEligibleForResultadoEtapa('proposta_enviada', byId('convertido'), ETAPAS, AUTOMACOES)).toBe(false);
    expect(isLeadEligibleForResultadoEtapa('contato_realizado', byId('perdido'), ETAPAS, AUTOMACOES)).toBe(false);
  });

  it('resultado desconhecido ou pipeline sem automacao cadastrada -> nao move', () => {
    expect(isLeadEligibleForResultadoEtapa('inexistente', byId('novo'), ETAPAS, AUTOMACOES)).toBe(false);
    const semAutomacaoQualificado = AUTOMACOES.filter((item) => item.resultado !== 'visita_agendada');
    expect(isLeadEligibleForResultadoEtapa('visita_agendada', byId('novo'), ETAPAS, semAutomacaoQualificado)).toBe(false);
  });
});

describe('resolveEtapaAlvoResultado', () => {
  it('usa a automacao configurada e, para venda/perdido, a etapa de sistema (fallback 1a etapa ativa do tipo)', () => {
    expect(resolveEtapaAlvoResultado('proposta_enviada', ETAPAS, AUTOMACOES).id).toBe('negociacao');
    const semConvertido = [
      ...ETAPAS.filter((item) => item.chave_sistema !== 'convertido'),
      etapa('ganho-b', 9, 'ganho'),
      etapa('ganho-a', 8, 'ganho'),
      etapa('ganho-inativo', 7, 'ganho', null, { ativo: false }),
    ];
    expect(resolveEtapaAlvoResultado('venda_realizada', semConvertido, AUTOMACOES).id).toBe('ganho-a');
  });

  it('sem automacao cadastrada para o resultado, nao resolve alvo', () => {
    expect(resolveEtapaAlvoResultado('proposta_enviada', ETAPAS, [])).toBeNull();
  });
});

describe('resultadoMotivoAplicaEm (espelha prepare_activity_business_state)', () => {
  it('venda/perdido sempre exigem motivo', () => {
    expect(resultadoMotivoAplicaEm('venda_realizada', byId('negociacao'), ETAPAS, AUTOMACOES)).toBe('ganho');
    expect(resultadoMotivoAplicaEm('lead_perdido', byId('perdido'), ETAPAS, AUTOMACOES)).toBe('perdido');
  });

  it('visita/test_drive so exigem quando a automacao leva para uma etapa que exige motivo', () => {
    expect(resultadoMotivoAplicaEm('visita_agendada', byId('novo'), ETAPAS, AUTOMACOES)).toBe('qualificado');
    expect(resultadoMotivoAplicaEm('test_drive', byId('qualificado'), ETAPAS, AUTOMACOES)).toBe('qualificado');
    expect(resultadoMotivoAplicaEm('visita_agendada', byId('negociacao'), ETAPAS, AUTOMACOES)).toBeNull();
    expect(resultadoMotivoAplicaEm('visita_agendada', byId('perdido'), ETAPAS, AUTOMACOES)).toBeNull();
  });

  it('demais resultados nao exigem motivo', () => {
    ['proposta_enviada', 'contato_realizado', 'sem_resposta'].forEach((resultado) => {
      expect(resultadoMotivoAplicaEm(resultado, byId('novo'), ETAPAS, AUTOMACOES)).toBeNull();
    });
  });
});

describe('lead x etapa', () => {
  it('acha a etapa por etapa_id e, sem ele, pela etapa de sistema do status', () => {
    expect(findEtapaDoLead(ETAPAS, { etapa_id: 'livre-pos-negoc', status: 'negociacao' }).id).toBe('livre-pos-negoc');
    expect(findEtapaDoLead(ETAPAS, { etapa_id: '', status: 'qualificado' }).id).toBe('qualificado');
    expect(getLeadEtapaLabel([], { status: 'negociacao' })).toBe('Negociação');
  });

  it('lead ativo pelo etapa_tipo (com fallback no status)', () => {
    expect(isLeadAtivo({ etapa_tipo: 'em_andamento', status: 'perdido' })).toBe(true);
    expect(isLeadAtivo({ etapa_tipo: 'ganho', status: 'negociacao' })).toBe(false);
    expect(isLeadAtivo({ status: 'em_contato' })).toBe(true);
    expect(isLeadAtivo(null)).toBe(false);
  });

  it('visual: etapa de sistema mantem classes; etapa livre usa a cor', () => {
    expect(getEtapaVisual(byId('perdido')).className).toContain('bg-red-600');
    const livre = getEtapaVisual(etapa('x', 1, 'em_andamento', null, { cor: '#fbbf24' }));
    expect(livre.style.backgroundColor).toBe('#fbbf24');
    expect(livre.style.color).toBe('#1a1a1a');
  });
});
