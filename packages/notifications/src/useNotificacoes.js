import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@macom/api-client/supabaseClient';
import { listNotificacoes, markAllNotificacoesRead, markNotificacaoRead } from './notificacoesClient';

// Hook generico do sino -- estado (lista + nao lidas), acoes (marcar lida / todas) e Realtime
// (INSERT em notificacoes.notificacoes do proprio colaborador). Cada app so desenha a UI.
// Requer <QueryClientProvider> no app. `onNew` recebe a linha crua do banco (titulo, mensagem,
// link...) -- e onde o app dispara o toast no formato da propria UI.
export function useNotificacoes({ sistema, colaboradorId, enabled = true, limit = 20, onNew }) {
  const queryClient = useQueryClient();
  const queryKey = ['notificacoes', sistema];
  const active = Boolean(enabled && sistema && colaboradorId);

  // Ref pra nao reassinar o canal Realtime toda vez que o app passar uma funcao nova.
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  const query = useQuery({
    queryKey,
    queryFn: () => listNotificacoes({ sistema, limit }),
    enabled: active,
    // Realtime ja invalida esta query; o polling e so fallback (5 min para poupar Log Ingestion).
    refetchInterval: 300000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const markReadMutation = useMutation({
    mutationFn: (id) => markNotificacaoRead({ sistema, id }),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificacoesRead({ sistema }),
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (!active || !supabase) return undefined;

    // Realtime aceita um filtro so -- filtra por colaborador no servidor (a RLS ja garante que
    // so chegam linhas dele) e por sistema aqui, pra o sino de um app nao reagir ao de outro.
    const channel = supabase
      .channel(`notificacoes:${sistema}:${colaboradorId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'notificacoes',
          table: 'notificacoes',
          filter: `colaborador_id=eq.${colaboradorId}`,
        },
        (payload) => {
          const row = payload.new || {};
          if (row.sistema !== sistema) return;
          queryClient.invalidateQueries({ queryKey: ['notificacoes', sistema] });
          onNewRef.current?.(row);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, sistema, colaboradorId, queryClient]);

  const items = Array.isArray(query.data?.items) ? query.data.items : [];

  return {
    items,
    unreadItems: items.filter((item) => !item.read),
    unreadCount: Number(query.data?.unread_count || 0),
    isLoading: query.isLoading,
    error: query.error,
    markRead: (id) => markReadMutation.mutate(id),
    markAllRead: () => markAllReadMutation.mutate(),
  };
}
