import { describe, expect, it } from 'vitest';
import {
  canSubmitLeadPipelineMove,
  resolveEtapaInicialSugerida,
  resolveLeadDragAction,
} from '@/lib/leadStatus';

// Nivel 3 (item 7) da auditoria do CRM (2026-10-20): drag-and-drop do Kanban (handleDragEnd) e
// troca de pipeline (movePipelineMutation/canSubmitMove) nao tinham nenhuma cobertura de teste.
// A decisao pura de cada fluxo foi extraida pra leadStatus.js (resolveLeadDragAction,
// resolveEtapaInicialSugerida, canSubmitLeadPipelineMove) exatamente pra viabilizar este arquivo
// sem precisar montar Leads.jsx inteiro (que depende de ~15 queries/mutations react-query).

const etapa = (id, ordem, tipo, extra = {}) => ({ id, nome: id, cor: '#3b82f6', ordem, tipo, ativo: true, exige_motivo: false, ...extra });

const ETAPAS = [
  etapa('novo', 0, 'em_andamento'),
  etapa('qualificado', 1, 'em_andamento', { exige_motivo: true }),
  etapa('negociacao', 2, 'em_andamento'),
  etapa('ganho', 3, 'ganho'),
  etapa('perdido', 4, 'perdido'),
];

const LEADS = [
  { id: 'lead-1', etapa_id: 'novo' },
  { id: 'lead-2', etapa_id: 'qualificado' },
];

describe('resolveLeadDragAction (drag-and-drop do Kanban)', () => {
  it('nao faz nada quando o drop nao tem destino (solto fora de uma coluna)', () => {
    const result = { destination: null, draggableId: 'lead-1' };
    expect(resolveLeadDragAction(result, ETAPAS, LEADS)).toEqual({ type: 'noop' });
  });

  it('nao faz nada quando solto na propria coluna (sem mudanca de etapa)', () => {
    const result = { destination: { droppableId: 'novo' }, draggableId: 'lead-1' };
    expect(resolveLeadDragAction(result, ETAPAS, LEADS)).toEqual({ type: 'noop' });
  });

  it('nao faz nada quando o lead ou a etapa de destino nao existem mais', () => {
    expect(resolveLeadDragAction(
      { destination: { droppableId: 'novo' }, draggableId: 'lead-inexistente' },
      ETAPAS,
      LEADS,
    )).toEqual({ type: 'noop' });

    expect(resolveLeadDragAction(
      { destination: { droppableId: 'etapa-inexistente' }, draggableId: 'lead-1' },
      ETAPAS,
      LEADS,
    )).toEqual({ type: 'noop' });
  });

  it('pede motivo ao mover para uma etapa que exige motivo (exige_motivo ou ganho/perdido)', () => {
    const paraQualificado = resolveLeadDragAction(
      { destination: { droppableId: 'qualificado' }, draggableId: 'lead-1' },
      ETAPAS,
      LEADS,
    );
    expect(paraQualificado.type).toBe('require_motivo');
    expect(paraQualificado.etapa.id).toBe('qualificado');

    const paraGanho = resolveLeadDragAction(
      { destination: { droppableId: 'ganho' }, draggableId: 'lead-1' },
      ETAPAS,
      LEADS,
    );
    expect(paraGanho.type).toBe('require_motivo');
  });

  it('move direto quando a etapa de destino nao exige motivo', () => {
    const action = resolveLeadDragAction(
      { destination: { droppableId: 'negociacao' }, draggableId: 'lead-1' },
      ETAPAS,
      LEADS,
    );
    expect(action).toEqual({ type: 'move', lead: LEADS[0], etapa: ETAPAS[2] });
  });
});

describe('resolveEtapaInicialSugerida (dialogo "Mudar de pipeline")', () => {
  const emAndamento = [ETAPAS[0], ETAPAS[1], ETAPAS[2]];

  it('sugere a etapa_inicial_id do pipeline quando ela existe entre as em_andamento', () => {
    expect(resolveEtapaInicialSugerida(emAndamento, 'negociacao')).toEqual(ETAPAS[2]);
  });

  it('cai pra 1a etapa em_andamento por ordem quando o pipeline nao tem etapa_inicial_id', () => {
    expect(resolveEtapaInicialSugerida(emAndamento, null)).toEqual(ETAPAS[0]);
  });

  it('cai pra 1a etapa em_andamento quando a etapa_inicial_id nao esta entre as em_andamento', () => {
    expect(resolveEtapaInicialSugerida(emAndamento, 'ganho')).toEqual(ETAPAS[0]);
  });

  it('retorna null quando nao ha etapa em_andamento nenhuma', () => {
    expect(resolveEtapaInicialSugerida([], 'novo')).toBeNull();
  });
});

describe('canSubmitLeadPipelineMove (validacao do dialogo "Mudar de pipeline")', () => {
  const base = { hasTarget: true, pipelineId: 'pipeline-2', etapaId: 'negociacao', etapaDestino: ETAPAS[2], motivoId: '' };

  it('bloqueia sem lead selecionado', () => {
    expect(canSubmitLeadPipelineMove({ ...base, hasTarget: false })).toBe(false);
  });

  it('bloqueia sem pipeline de destino', () => {
    expect(canSubmitLeadPipelineMove({ ...base, pipelineId: '' })).toBe(false);
  });

  it('bloqueia sem etapa de destino', () => {
    expect(canSubmitLeadPipelineMove({ ...base, etapaId: '' })).toBe(false);
  });

  it('permite quando a etapa de destino nao exige motivo', () => {
    expect(canSubmitLeadPipelineMove(base)).toBe(true);
  });

  it('bloqueia quando a etapa de destino exige motivo e nenhum foi selecionado', () => {
    expect(canSubmitLeadPipelineMove({ ...base, etapaId: 'qualificado', etapaDestino: ETAPAS[1] })).toBe(false);
  });

  it('permite quando a etapa de destino exige motivo e um foi selecionado', () => {
    expect(canSubmitLeadPipelineMove({
      ...base, etapaId: 'qualificado', etapaDestino: ETAPAS[1], motivoId: 'motivo-1',
    })).toBe(true);
  });
});
