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

  // Busca todas as etapas/automacoes (sem filtrar por pipeline_id) e filtra no cliente pelo
  // pipeline resolvido. Antes essas duas queries so disparavam depois que `pipeline.id` chegava
  // (dependente da query de pipelines acima), virando uma 2a rodada sequencial de rede. Como o
  // volume de etapas/automacoes de todos os pipelines e pequeno, buscar tudo de uma vez e filtrar
  // aqui permite que as 3 queries deste hook disparem juntas, em paralelo, eliminando essa rodada.
  const { data: etapasTodas = [], isLoading: carregandoEtapas } = useQuery({
    queryKey: ['crm-etapas-pipeline-todas'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () => crmDataClient.entities.EtapaPipeline.listPage({
      orderBy: 'ordem',
      limit: 500,
    }).then((result) => result.rows),
  });

  const etapasOrdenadas = useMemo(() => {
    if (!pipeline?.id) return [];
    return etapasTodas
      .filter((etapa) => etapa.pipeline_id === pipeline.id)
      .sort((a, b) => Number(a.ordem) - Number(b.ordem));
  }, [etapasTodas, pipeline]);
  const etapasAtivas = useMemo(() => etapasOrdenadas.filter((etapa) => etapa.ativo), [etapasOrdenadas]);

  const { data: automacoesTodas = [], isLoading: carregandoAutomacoes } = useQuery({
    queryKey: ['crm-pipeline-automacoes-todas'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: () => crmDataClient.entities.PipelineAutomacao.listPage({
      limit: 500,
    }).then((result) => result.rows),
  });

  const automacoes = useMemo(() => {
    if (!pipeline?.id) return [];
    return automacoesTodas.filter((automacao) => automacao.pipeline_id === pipeline.id);
  }, [automacoesTodas, pipeline]);

  return {
    pipeline,
    pipelines,
    etapas: etapasOrdenadas,
    etapasAtivas,
    automacoes,
    isLoading: carregandoPipelines || carregandoEtapas || carregandoAutomacoes,
  };
}
