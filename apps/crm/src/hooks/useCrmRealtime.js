import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@macom/api-client/supabaseClient';

const REALTIME_TABLES = [
  { schema: 'gestao_crm', table: 'leads' },
  { schema: 'gestao_crm', table: 'clientes_crm' },
  { schema: 'gestao_crm', table: 'atendimentos' },
  { schema: 'gestao_crm', table: 'historico_atendimentos' },
  { schema: 'gestao_crm', table: 'veiculos_interesse' },
  { schema: 'public', table: 'categorias_veiculo' },
  { schema: 'gestao_crm', table: 'origens_lead' },
  { schema: 'public', table: 'marcas_veiculo' },
  { schema: 'public', table: 'modelos_veiculo' },
  { schema: 'public', table: 'versoes_veiculo' },
  { schema: 'gestao_crm', table: 'veiculos_estoque' },
  { schema: 'public', table: 'veiculos' },
  { schema: 'gestao_crm', table: 'configuracoes_distribuicao' },
  { schema: 'gestao_crm', table: 'vendedores_distribuicao' },
  { schema: 'gestao_crm', table: 'conversas_atendimento' },
  { schema: 'gestao_crm', table: 'mensagens_atendimento' },
  { schema: 'gestao_crm', table: 'pipelines' },
  { schema: 'gestao_crm', table: 'etapas_pipeline' },
  { schema: 'gestao_crm', table: 'motivos_status' },
];

const TABLE_CACHE_CONFIG = {
  leads: {
    // 'leads-kanban' precisa estar aqui tambem (nao so no INSERT/invalidateCompatibleLeadQueries):
    // e a query que a visao Kanban le, e UPDATE/DELETE (troca de etapa, edicao de campo) e tratado
    // por patchCachedQueries, que so mexe nas queryKeys listadas abaixo.
    queryKeys: [['leads'], ['leads-kanban'], ['cliente-leads'], ['atividade-leads'], ['dashboard-metrics']],
    mapRow: mapLeadRow,
  },
  clientes_crm: {
    queryKeys: [['clientes'], ['dashboard-metrics']],
    mapRow: mapClienteRow,
  },
  atendimentos: {
    queryKeys: [['eventos'], ['eventos-resumo'], ['eventos-contadores'], ['cliente-atendimentos'], ['atividade-planejadas'], ['dashboard-metrics']],
    // Contagens agregadas (nao arrays/paginas de atendimento) -- patchCachedQueries nao sabe
    // atualiza-las incrementalmente, entao sao sempre invalidadas (refetch), independente do
    // eventType, em vez de entrarem em queryKeys.
    countKeys: [['crm-atividades-atrasadas']],
    mapRow: mapAtendimentoRow,
  },
  historico_atendimentos: {
    queryKeys: [['historico-atendimento'], ['cliente-historico'], ['lead-historico']],
    mapRow: mapHistoricoRow,
  },
  veiculos_interesse: {
    queryKeys: [['leads'], ['cliente-leads'], ['lead-historico']],
  },
  categorias_veiculo: {
    queryKeys: [['crm-categorias-veiculo']],
  },
  origens_lead: {
    queryKeys: [['crm-origens-lead']],
  },
  marcas_veiculo: {
    queryKeys: [['crm-marcas-veiculo']],
  },
  modelos_veiculo: {
    queryKeys: [['crm-modelos-veiculo']],
  },
  versoes_veiculo: {
    queryKeys: [['crm-versoes-veiculo']],
  },
  veiculos_estoque: {
    queryKeys: [['crm-veiculos-estoque']],
  },
  veiculos: {
    queryKeys: [['crm-veiculos-estoque']],
  },
  configuracoes_distribuicao: {
    queryKeys: [['crm-distribuicao']],
  },
  vendedores_distribuicao: {
    queryKeys: [['crm-distribuicao'], ['crm-responsaveis']],
  },
  conversas_atendimento: {
    queryKeys: [['conversas-atendimento'], ['dashboard-metrics']],
  },
  mensagens_atendimento: {
    // sem `exact: true` no invalidateQueries: casa qualquer chave iniciada por
    // 'mensagens-atendimento', incluindo ['mensagens-atendimento', conversaId].
    queryKeys: [['mensagens-atendimento'], ['conversas-atendimento']],
  },
  pipelines: {
    queryKeys: [['crm-pipelines']],
  },
  etapas_pipeline: {
    // casa ['crm-etapas-pipeline', pipelineId] (usePipelineEtapas e tela de Pipelines)
    queryKeys: [['crm-etapas-pipeline']],
  },
  motivos_status: {
    queryKeys: [['crm-motivos-status']],
  },
};

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeDateOnly(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}

function baseDates(row = {}) {
  return {
    created_date: row.criado_em || row.created_date || null,
    updated_date: row.atualizado_em || row.updated_date || null,
  };
}

function mapClienteRow(row = {}) {
  return {
    id: row.id,
    nome: row.nome || '',
    telefone: row.telefone || '',
    telefone_normalizado: row.telefone_normalizado || normalizePhone(row.telefone),
    email: row.email || '',
    email_normalizado: row.email_normalizado || '',
    empresa: row.empresa || 'Macom Ananindeua',
    status_relacionamento: row.status_relacionamento || 'lead',
    observacoes: row.observacoes || '',
    ...baseDates(row),
  };
}

function mapLeadRow(row = {}) {
  const slaDeadline = row.sla_primeiro_contato_em || null;
  const firstContact = row.primeiro_contato_em || null;
  const slaAlertMinutes = Number(row.sla_alerta_minutos ?? 10);
  const deadlineTime = slaDeadline ? new Date(slaDeadline).getTime() : null;
  const remainingMinutes = deadlineTime
    ? Math.ceil((deadlineTime - Date.now()) / 60000)
    : null;

  return {
    id: row.id,
    cliente_id: row.cliente_id || '',
    nome: row.nome || '',
    telefone: row.telefone || '',
    telefone_normalizado: row.telefone_normalizado || normalizePhone(row.telefone),
    email: row.email || '',
    email_normalizado: row.email_normalizado || '',
    origem_id: row.origem_id || '',
    status: row.status || 'novo',
    pipeline_id: row.pipeline_id || '',
    etapa_id: row.etapa_id || '',
    etapa_tipo: row.etapa_tipo || (row.status === 'convertido' ? 'ganho' : row.status === 'perdido' ? 'perdido' : 'em_andamento'),
    motivo_status_id: row.motivo_status_id || '',
    modelo_interesse: row.modelo_interesse || '',
    empresa: row.empresa || 'Macom Ananindeua',
    convertido_em: row.convertido_em || null,
    perdido_em: row.perdido_em || null,
    motivo_perda: row.motivo_perda || '',
    responsavel_id: row.responsavel_id || '',
    unidade_id: row.unidade_id || '',
    atribuido_em: row.atribuido_em || null,
    primeiro_contato_em: firstContact,
    sla_primeiro_contato_em: slaDeadline,
    sla_primeiro_contato_minutos: Number(row.sla_primeiro_contato_minutos ?? 30),
    sla_alerta_minutos: slaAlertMinutes,
    sla_minutos_restantes: remainingMinutes,
    sla_status: firstContact
      ? 'concluido'
      : deadlineTime && deadlineTime < Date.now()
        ? 'atrasado'
        : remainingMinutes !== null && remainingMinutes <= slaAlertMinutes
          ? 'alerta'
          : 'no_prazo',
    observacoes: row.observacoes || '',
    ...baseDates(row),
  };
}

function mapAtendimentoRow(row = {}) {
  return {
    id: row.id,
    lead_id: row.lead_id || '',
    cliente_id: row.cliente_id || '',
    titulo: row.titulo || '',
    status: row.status || 'planejada',
    tipo_evento: row.tipo_atendimento || row.tipo_evento || 'ligacao',
    temperatura: row.temperatura || 'morno',
    proximo_contato: normalizeDateOnly(row.proximo_contato),
    observacoes: row.observacoes || '',
    resultado: row.resultado || '',
    motivo_resultado: row.motivo_resultado || '',
    concluido_em: row.concluido_em || null,
    ...baseDates(row),
  };
}

function mapHistoricoRow(row = {}) {
  return {
    id: row.id,
    cliente_id: row.cliente_id || '',
    lead_id: row.lead_id || '',
    atendimento_id: row.atendimento_id || row.entidade_id || '',
    tipo: row.tipo || '',
    descricao: row.descricao || '',
    entidade: row.entidade || '',
    entidade_id: row.entidade_id || row.atendimento_id || row.lead_id || '',
    status: row.status || '',
    metadados: row.metadados || {},
    created_date: row.criado_em || null,
  };
}

function mergeItem(current = {}, next = {}) {
  const responsavelChanged = next.responsavel_id && current.responsavel_id && next.responsavel_id !== current.responsavel_id;

  return {
    ...current,
    ...next,
    responsavel: current.responsavel || next.responsavel || null,
    responsavel_nome: responsavelChanged ? '' : (current.responsavel_nome || next.responsavel_nome || ''),
    cliente_nome: current.cliente_nome || next.cliente_nome || '',
    telefone: next.telefone || current.telefone || '',
    empresa: next.empresa || current.empresa || 'Macom Ananindeua',
  };
}

function updateRows(rows = [], eventType, nextItem, oldId) {
  if (!nextItem?.id && !oldId) return rows;

  if (eventType === 'DELETE') {
    return rows.filter((item) => item.id !== oldId);
  }

  if (eventType === 'UPDATE') {
    let touched = false;
    const nextRows = rows.map((item) => {
      if (item.id !== nextItem.id) return item;
      touched = true;
      return mergeItem(item, nextItem);
    });
    return touched ? nextRows : rows;
  }

  return rows;
}

function patchQueryData(current, eventType, nextItem, oldId) {
  if (!current) return current;

  if (Array.isArray(current)) {
    return updateRows(current, eventType, nextItem, oldId);
  }

  if (Array.isArray(current.rows)) {
    const rows = updateRows(current.rows, eventType, nextItem, oldId);
    const removed = eventType === 'DELETE' && rows.length !== current.rows.length;
    return {
      ...current,
      rows,
      count: removed ? Math.max(0, (current.count || 0) - 1) : current.count,
    };
  }

  if (current.id && current.id === nextItem?.id && eventType === 'UPDATE') {
    return mergeItem(current, nextItem);
  }

  return current;
}

function patchCachedQueries(queryClient, queryKeys, eventType, nextItem, oldId) {
  queryKeys.forEach((queryKey) => {
    queryClient.setQueriesData({ queryKey }, (current) => patchQueryData(current, eventType, nextItem, oldId));
  });
}

function invalidateQueries(queryClient, queryKeys) {
  queryKeys.forEach((queryKey) => {
    queryClient.invalidateQueries({ queryKey });
  });
}

// INSERT de lead: so invalida paginas de ['leads']/['leads-kanban'] cujo filtro e compativel
// com o novo lead, em vez de invalidar toda pagina aberta por qualquer vendedor/unidade.
// Campo ausente no filtro (nao restringe) ou 'busca' ativa (nao da pra saber se o novo lead
// bateria na busca sem reexecutar) sempre contam como compativel -- fail-open por design,
// nunca fail-closed: na duvida, invalida.
function leadFiltersMatchItem(filters = {}, nextItem = {}) {
  if (filters.busca) return true;
  const campos = ['empresa', 'unidade_id', 'responsavel_id', 'origem_id'];
  return campos.every((campo) => {
    const valorFiltro = filters[campo];
    if (valorFiltro === undefined || valorFiltro === null || valorFiltro === '') return true;
    if (valorFiltro === '__NULL__') return !nextItem[campo];
    return String(valorFiltro) === String(nextItem[campo] ?? '');
  });
}

function invalidateCompatibleLeadQueries(queryClient, queryKeyRoots, nextItem) {
  queryKeyRoots.forEach((root) => {
    const queries = queryClient.getQueryCache().findAll({ queryKey: [root] });
    queries.forEach((query) => {
      const params = query.queryKey[1];
      const filters = params && typeof params === 'object' ? { ...params.filters, busca: params.busca } : {};
      if (leadFiltersMatchItem(filters, nextItem)) {
        queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true });
      }
    });
  });
}

function handleRealtimeChange(queryClient, payload) {
  const config = TABLE_CACHE_CONFIG[payload.table];
  if (!config) return;

  const queryKeys = config.queryKeys || [];
  const eventType = payload.eventType;
  const oldId = payload.old?.id;
  const nextItem = config.mapRow ? config.mapRow(payload.new || payload.old || {}) : null;

  if (config.countKeys?.length) {
    invalidateQueries(queryClient, config.countKeys);
  }

  // mensagens_atendimento: invalidacao exata por conversa_id (so a conversa afetada revalida,
  // nao qualquer conversa aberta no momento) -- ['conversas-atendimento'] (lista de conversas,
  // dataset pequeno) continua invalidando em geral.
  if (payload.table === 'mensagens_atendimento') {
    const conversaId = payload.new?.conversa_id ?? payload.old?.conversa_id;
    if (conversaId) {
      queryClient.invalidateQueries({ queryKey: ['mensagens-atendimento', conversaId], exact: true });
    } else {
      queryClient.invalidateQueries({ queryKey: ['mensagens-atendimento'] });
    }
    queryClient.invalidateQueries({ queryKey: ['conversas-atendimento'] });
    return;
  }

  if (!config.mapRow) {
    invalidateQueries(queryClient, queryKeys);
    return;
  }

  if (eventType === 'UPDATE' || eventType === 'DELETE') {
    patchCachedQueries(queryClient, queryKeys, eventType, nextItem, oldId);
    return;
  }

  if (payload.table === 'leads') {
    invalidateCompatibleLeadQueries(queryClient, ['leads', 'leads-kanban'], nextItem);
    invalidateQueries(queryClient, [['cliente-leads'], ['atividade-leads'], ['dashboard-metrics']]);
    return;
  }

  invalidateQueries(queryClient, queryKeys);
}

export function useCrmRealtime(enabled = true, accessContext = {}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(enabled ? 'connecting' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimeoutRef = useRef(null);
  const { collaboratorId, unitId, nivelAcesso } = accessContext;

  useEffect(() => {
    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (!enabled) {
      setStatus('disabled');
      return undefined;
    }

    if (!isSupabaseConfigured || !supabase) {
      setStatus('unavailable');
      return undefined;
    }

    setStatus('connecting');

    const channel = supabase.channel('crm-realtime');

    const onChange = (payload) => {
      setStatus('syncing');
      handleRealtimeChange(queryClient, payload);
      setLastSyncedAt(Date.now());

      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = window.setTimeout(() => {
        setStatus('active');
        syncTimeoutRef.current = null;
      }, 800);
    };

    REALTIME_TABLES.forEach(({ schema, table }) => {
      // 'leads' tem tratamento proprio logo abaixo (filtro por nivel de acesso) -- as demais
      // tabelas continuam sem filtro, como sempre foram (atendimentos/clientes/conversas usam
      // EXISTS/join pra decidir acesso, que uma subscription nao consegue replicar sem risco
      // de perder evento legitimo; ver access-scope.ts).
      if (table === 'leads') return;
      channel.on('postgres_changes', { event: '*', schema, table }, onChange);
    });

    // access-scope.ts (buildAccessScope): usuario = (responsavel_id = x or criado_por = x),
    // gestor = unidade_id = x -- as duas colunas sao diretas em gestao_crm.leads, entao da pra
    // replicar exatamente com filter de subscription (usuario precisa de 2 subscriptions pro
    // OR, Realtime so aceita uma condicao por `filter`). admin, ou nivel/dado ainda nao
    // carregado, fica sem filtro -- fail-open, nunca perde evento por falta de contexto.
    if (nivelAcesso === 'gestor' && unitId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'gestao_crm', table: 'leads', filter: `unidade_id=eq.${unitId}` },
        onChange,
      );
    } else if (nivelAcesso === 'usuario' && collaboratorId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'gestao_crm', table: 'leads', filter: `responsavel_id=eq.${collaboratorId}` },
        onChange,
      );
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'gestao_crm', table: 'leads', filter: `criado_por=eq.${collaboratorId}` },
        onChange,
      );
    } else {
      channel.on('postgres_changes', { event: '*', schema: 'gestao_crm', table: 'leads' }, onChange);
    }

    channel.subscribe((nextStatus) => {
      if (nextStatus === 'SUBSCRIBED') {
        setStatus('active');
        return;
      }

      if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
        setStatus('error');
        return;
      }

      if (nextStatus === 'CLOSED') {
        setStatus('disabled');
      }
    });

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, collaboratorId, unitId, nivelAcesso]);

  return { status, lastSyncedAt };
}
