import { describe, expect, it } from 'vitest';
import {
  LEAD_STATUS_REQUIREMENTS,
  RESULTADO_LEAD_STATUS_TARGET,
  isLeadEligibleForResultado,
} from '@/lib/leadStatus';

// Este teste fixa em JS as regras hoje implementadas em duas triggers Postgres distintas,
// para pegar drift entre elas (ja aconteceu uma vez: ver cabecalho de
// supabase/migrations/20260917000000_fix_activity_outcome_lead_status_requirements.sql).
// Se qualquer um dos dois lados mudar sem atualizar o outro, este teste deve quebrar.
//
// Fonte 1: gestao_crm.prepare_lead_phase1() -- mudanca manual de status do lead
//   (supabase/migrations/20260912140000_add_crm_motivos_status.sql:87-106)
//   exige motivo_status_id para status in (qualificado, convertido, perdido);
//   exige previsao_fechamento para status = negociacao.
//
// Fonte 2: gestao_crm.prepare_activity_business_state() + apply_activity_outcome() --
//   conclusao de atividade (supabase/migrations/20260917000000_...sql:77-182)
//   resultado -> status alvo, elegibilidade (WHERE do UPDATE) e exigencia de
//   motivo_status_id/previsao_fechamento nessa mesma conclusao.

describe('LEAD_STATUS_REQUIREMENTS (espelha prepare_lead_phase1)', () => {
  it('exige motivo para qualificado, convertido e perdido', () => {
    expect(LEAD_STATUS_REQUIREMENTS.qualificado.motivo).toBe(true);
    expect(LEAD_STATUS_REQUIREMENTS.convertido.motivo).toBe(true);
    expect(LEAD_STATUS_REQUIREMENTS.perdido.motivo).toBe(true);
  });

  it('nao exige motivo para negociacao, mas exige previsao_fechamento', () => {
    expect(LEAD_STATUS_REQUIREMENTS.negociacao.motivo).toBe(false);
    expect(LEAD_STATUS_REQUIREMENTS.negociacao.fields).toEqual(['previsao_fechamento']);
  });

  it('nao tem requisito para novo, tentativa_contato e em_contato (banco tambem nao exige)', () => {
    expect(LEAD_STATUS_REQUIREMENTS.novo).toBeUndefined();
    expect(LEAD_STATUS_REQUIREMENTS.tentativa_contato).toBeUndefined();
    expect(LEAD_STATUS_REQUIREMENTS.em_contato).toBeUndefined();
  });
});

describe('RESULTADO_LEAD_STATUS_TARGET (espelha apply_activity_outcome)', () => {
  it('mapeia cada resultado terminal/nao-terminal para o status alvo correto', () => {
    expect(RESULTADO_LEAD_STATUS_TARGET).toEqual({
      venda_realizada: 'convertido',
      lead_perdido: 'perdido',
      proposta_enviada: 'negociacao',
      visita_agendada: 'qualificado',
      test_drive: 'qualificado',
    });
  });

  it('contato_realizado e sem_resposta nao tem entrada aqui de proposito', () => {
    // apply_activity_outcome() move o lead para em_contato/tentativa_contato nesses casos,
    // mas esses status alvo nao tem entrada em LEAD_STATUS_REQUIREMENTS (nao exigem motivo
    // nem previsao), entao o form nao precisa saber do alvo para decidir campos obrigatorios.
    expect(RESULTADO_LEAD_STATUS_TARGET.contato_realizado).toBeUndefined();
    expect(RESULTADO_LEAD_STATUS_TARGET.sem_resposta).toBeUndefined();
  });
});

describe('isLeadEligibleForResultado (espelha o WHERE de apply_activity_outcome)', () => {
  const ACTIVE_BEFORE_NEGOCIACAO = ['novo', 'tentativa_contato', 'em_contato', 'qualificado'];
  const ACTIVE_BEFORE_QUALIFICADO = ['novo', 'tentativa_contato', 'em_contato', 'qualificado'];

  it('venda_realizada e lead_perdido sao sempre elegiveis, em qualquer status', () => {
    for (const status of ['novo', 'negociacao', 'convertido', 'perdido', 'qualificado']) {
      expect(isLeadEligibleForResultado('venda_realizada', status)).toBe(true);
      expect(isLeadEligibleForResultado('lead_perdido', status)).toBe(true);
    }
  });

  it('proposta_enviada e elegivel ate negociacao, mas nao apos convertido/perdido', () => {
    for (const status of [...ACTIVE_BEFORE_NEGOCIACAO, 'negociacao']) {
      expect(isLeadEligibleForResultado('proposta_enviada', status)).toBe(true);
    }
    expect(isLeadEligibleForResultado('proposta_enviada', 'convertido')).toBe(false);
    expect(isLeadEligibleForResultado('proposta_enviada', 'perdido')).toBe(false);
  });

  it('visita_agendada e test_drive sao elegiveis ate qualificado, mas nao em negociacao em diante', () => {
    for (const status of ACTIVE_BEFORE_QUALIFICADO) {
      expect(isLeadEligibleForResultado('visita_agendada', status)).toBe(true);
      expect(isLeadEligibleForResultado('test_drive', status)).toBe(true);
    }
    expect(isLeadEligibleForResultado('visita_agendada', 'negociacao')).toBe(false);
    expect(isLeadEligibleForResultado('test_drive', 'negociacao')).toBe(false);
  });

  it('resultado desconhecido nunca e elegivel', () => {
    expect(isLeadEligibleForResultado('resultado_inexistente', 'novo')).toBe(false);
  });
});
