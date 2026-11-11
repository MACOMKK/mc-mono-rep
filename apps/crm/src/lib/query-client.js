import { QueryClient, keepPreviousData } from '@tanstack/react-query';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const CACHE_POLICIES = [
  {
    queryKey: ['leads'],
    options: { staleTime: 45 * SECOND, gcTime: 10 * MINUTE },
  },
  {
    queryKey: ['clientes'],
    options: { staleTime: 60 * SECOND, gcTime: 10 * MINUTE },
  },
  {
    queryKey: ['eventos'],
    options: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE },
  },
  {
    queryKey: ['eventos-resumo'],
    options: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE },
  },
  {
    queryKey: ['historico-atendimento'],
    options: { staleTime: 30 * SECOND, gcTime: 10 * MINUTE },
  },
  {
    queryKey: ['crm-responsaveis'],
    options: { staleTime: 15 * MINUTE, gcTime: 30 * MINUTE },
  },
  {
    queryKey: ['crm-leads-catalogos'],
    options: { staleTime: 15 * MINUTE, gcTime: 30 * MINUTE },
  },
  {
    queryKey: ['crm-distribuicao'],
    options: { staleTime: 5 * MINUTE, gcTime: 30 * MINUTE },
  },
];

// Falhas transitorias (rede, timeout, 5xx -- comuns com Edge Function e banco em regioes
// diferentes) sao repetidas com backoff; erros 4xx (permissao, validacao, sessao) nao, porque
// repetir nao muda o resultado. Timeout (504) NAO repete: ja custou 20s, e repetir dobra a espera
// (visto em 2026-11-10: tela travada por 40s) sem ajudar quando o servidor esta preso.
function shouldRetryQuery(failureCount, error) {
	const status = Number(error?.status) || 0;
	if (status === 504) return false;
	if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false;
	return failureCount < 2;
}

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			refetchOnReconnect: true,
			staleTime: 30 * SECOND,
			gcTime: 10 * MINUTE,
			placeholderData: keepPreviousData,
			retry: shouldRetryQuery,
			retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
		},
	},
});

CACHE_POLICIES.forEach(({ queryKey, options }) => {
	queryClientInstance.setQueryDefaults(queryKey, options);
});
