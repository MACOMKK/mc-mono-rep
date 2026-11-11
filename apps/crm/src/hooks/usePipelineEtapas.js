import { useMemo } from 'react';
import { useLeadsCatalogos } from './useLeadsCatalogos';

// Etapas (gestao_crm.etapas_pipeline) de um pipeline, ordenadas por `ordem`. Sem pipelineId,
// usa o pipeline padrao. Os dados (pipelines/etapas/automacoes) vem de useLeadsCatalogos (1
// unica chamada combinada ao crm-api, queryKey crm-leads-catalogos) -- este hook so filtra/
// ordena no cliente pelo pipeline resolvido, sem fazer fetch proprio.
export function usePipelineEtapas({ pipelineId, enabled = true } = {}) {
  const {
    pipelines,
    etapasPipeline: etapasTodas,
    pipelineAutomacoes: automacoesTodas,
    isLoading,
  } = useLeadsCatalogos({ enabled });

  const pipeline = useMemo(() => {
    if (pipelineId) return pipelines.find((item) => item.id === pipelineId) || null;
    return pipelines.find((item) => item.padrao) || pipelines.find((item) => item.ativo) || null;
  }, [pipelineId, pipelines]);

  const etapasOrdenadas = useMemo(() => {
    if (!pipeline?.id) return [];
    return etapasTodas
      .filter((etapa) => etapa.pipeline_id === pipeline.id)
      .sort((a, b) => Number(a.ordem) - Number(b.ordem));
  }, [etapasTodas, pipeline]);
  const etapasAtivas = useMemo(() => etapasOrdenadas.filter((etapa) => etapa.ativo), [etapasOrdenadas]);

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
    isLoading,
  };
}
