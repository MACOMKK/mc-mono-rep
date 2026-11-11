import { useQuery } from '@tanstack/react-query';
import { crmDataClient } from '@/api/crmDataClient';

// Fonte unica dos catalogos usados pela tela de Leads (pipelines, etapas_pipeline,
// pipeline_automacoes, origens_lead, motivos_status, responsaveis). Antes eram 6 useQuery
// separados disparando 6 chamadas simultaneas ao crm-api -- com o pool da function limitado a
// max:3 conexoes, 5 delas travavam ate o timeout de 20s do front (2026-11-11). Agora e 1 unico
// useQuery sobre a action composta list_catalogos_leads (1 round-trip so). usePipelineEtapas.js
// consome este hook por composicao (mesma queryKey, sem fetch proprio) -- o React Query faz
// dedupe, entao usar este hook aqui e dentro de usePipelineEtapas ao mesmo tempo nao duplica a
// requisicao de rede.
export function useLeadsCatalogos({ enabled = true } = {}) {
  const { data, isLoading } = useQuery({
    queryKey: ['crm-leads-catalogos'],
    queryFn: () => crmDataClient.leadsCatalogos.get(),
    enabled,
  });

  return {
    pipelines: data?.pipelines || [],
    etapasPipeline: data?.etapasPipeline || [],
    pipelineAutomacoes: data?.pipelineAutomacoes || [],
    origensLead: data?.origensLead || [],
    motivosStatus: data?.motivosStatus || [],
    responsaveis: data?.responsaveis || [],
    isLoading,
  };
}
