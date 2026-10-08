import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { crmDataClient } from '@/api/crmDataClient';

// Etapas (gestao_crm.etapas_pipeline) de um pipeline, ordenadas por `ordem`. Sem pipelineId,
// usa o pipeline padrao. As query keys sao as mesmas da tela de Pipelines, entao editar uma
// etapa la (ou o realtime de etapas_pipeline) atualiza Kanban/LeadForm/EventoForm.
export function usePipelineEtapas({ pipelineId, enabled = true } = {}) {
  const { data: pipelines = [], isLoading: carregandoPipelines } = useQuery({
    queryKey: ['crm-pipelines'],
    queryFn: () => crmDataClient.entities.Pipeline.list('nome'),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const pipeline = useMemo(() => {
    if (pipelineId) return pipelines.find((item) => item.id === pipelineId) || null;
    return pipelines.find((item) => item.padrao) || pipelines.find((item) => item.ativo) || null;
  }, [pipelineId, pipelines]);

  const { data: etapas = [], isLoading: carregandoEtapas } = useQuery({
    queryKey: ['crm-etapas-pipeline', pipeline?.id],
    enabled: enabled && Boolean(pipeline?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => crmDataClient.entities.EtapaPipeline.listPage({
      orderBy: 'ordem',
      filters: { pipeline_id: pipeline.id },
      limit: 100,
    }).then((result) => result.rows),
  });

  const etapasOrdenadas = useMemo(
    () => [...etapas].sort((a, b) => Number(a.ordem) - Number(b.ordem)),
    [etapas],
  );
  const etapasAtivas = useMemo(() => etapasOrdenadas.filter((etapa) => etapa.ativo), [etapasOrdenadas]);

  const { data: automacoes = [], isLoading: carregandoAutomacoes } = useQuery({
    queryKey: ['crm-pipeline-automacoes', pipeline?.id],
    enabled: enabled && Boolean(pipeline?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => crmDataClient.entities.PipelineAutomacao.listPage({
      filters: { pipeline_id: pipeline.id },
      limit: 100,
    }).then((result) => result.rows),
  });

  return {
    pipeline,
    pipelines,
    etapas: etapasOrdenadas,
    etapasAtivas,
    automacoes,
    isLoading: carregandoPipelines || (Boolean(pipeline?.id) && (carregandoEtapas || carregandoAutomacoes)),
  };
}
