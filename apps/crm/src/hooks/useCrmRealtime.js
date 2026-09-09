import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@macom/api-client/supabaseClient';

const REALTIME_TABLES = [
  'leads',
  'clientes',
  'atendimentos',
  'historico_atendimentos',
  'veiculos_interesse',
  'categorias_veiculo',
  'origens_lead',
  'configuracoes_distribuicao',
  'vendedores_distribuicao',
  'conversas_atendimento',
  'mensagens_atendimento',
];

const TABLE_CACHE_CONFIG = {
  leads: {
    queryKeys: [['leads'], ['cliente-leads'], ['atividade-leads'], ['dashboard-metrics']],
    mapRow: mapLeadRow,
  },
  clientes: {
    queryKeys: [['clientes'], ['dashboard-metrics']],
    mapRow: mapClienteRow,
  },
  atendimentos: {
    queryKeys: [['eventos'], ['eventos-resumo'], ['eventos-contadores'], ['cliente-atendimentos'], ['atividade-planejadas'], ['dashboard-metrics']],
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
    previsao_fechamento: normalizeDateOnly(row.previsao_fechamento),
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

function handleRealtimeChange(queryClient, payload) {
  const config = TABLE_CACHE_CONFIG[payload.table];
  if (!config) return;

  const queryKeys = config.queryKeys || [];
  const eventType = payload.eventType;
  const oldId = payload.old?.id;
  const nextItem = config.mapRow ? config.mapRow(payload.new || payload.old || {}) : null;

  if (!config.mapRow) {
    invalidateQueries(queryClient, queryKeys);
    return;
  }

  if (eventType === 'UPDATE' || eventType === 'DELETE') {
    patchCachedQueries(queryClient, queryKeys, eventType, nextItem, oldId);
    return;
  }

  invalidateQueries(queryClient, queryKeys);
}

export function useCrmRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(enabled ? 'connecting' : 'disabled');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimeoutRef = useRef(null);

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

    REALTIME_TABLES.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'gestao_crm', table },
        (payload) => {
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
        },
      );
    });

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
  }, [enabled, queryClient]);

  return { status, lastSyncedAt };
}
