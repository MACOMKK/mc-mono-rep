import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, BellRing, CheckCheck } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import { supabase } from '@macom/api-client/supabaseClient';
import { Button, useToast } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import { usePush } from '@/lib/PushContext';

function formatNotificacaoData(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const notificacoesKey = ['servicos', 'notificacoes'];

export default function NotificationsBell({ buttonClassName = '' }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const colaboradorId = user?.collaborator?.id;
  // O sino e montado em mais de um lugar ao mesmo tempo (Sidebar desktop + header mobile, so
  // um fica visivel por CSS, mas os dois ficam no DOM) -- sem esse id por instancia, os dois
  // abririam um canal Realtime com o mesmo nome e o supabase-js quebra a aba inteira.
  const instanceId = useId();
  const push = usePush();

  const notificacoesQuery = useQuery({
    queryKey: notificacoesKey,
    queryFn: () => financeiroApi.notificacoes.list(),
    enabled: Boolean(colaboradorId),
    // Realtime ja invalida esta query; o polling e so fallback (5 min para poupar Log Ingestion).
    refetchInterval: 300000,
  });
  const notificacoes = notificacoesQuery.data || [];
  const naoLidas = notificacoes.filter((item) => !item.lida_em);
  const lidas = notificacoes.filter((item) => item.lida_em);

  const marcarLidaMutation = useMutation({
    mutationFn: (id) => financeiroApi.notificacoes.marcarLida(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificacoesKey }),
  });

  const marcarTodasLidasMutation = useMutation({
    mutationFn: () => financeiroApi.notificacoes.marcarTodasLidas(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificacoesKey }),
  });

  useEffect(() => {
    function handleClickOutside(event) {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // subscribe()/unsubscribe() capturam o erro internamente em push.error em vez de rejeitar a
  // Promise -- sem isso o clique no sino falhava silenciosamente (ex.: sessao expirada, push-api
  // fora do ar) sem nenhum feedback visivel.
  useEffect(() => {
    if (push.error) toast({ title: 'Erro', description: push.error.message, variant: 'destructive' });
  }, [push.error, toast]);

  // Empurra notificacao nova em tempo real (aprovacao/reprovacao/pagamento/nova solicitacao
  // pra aprovar), sem precisar de polling curto -- mesmo padrao ja usado em
  // apps/intranet/src/components/layout/Header.jsx e apps/crm/src/hooks/useCrmRealtime.js.
  useEffect(() => {
    if (!colaboradorId || !supabase) return undefined;

    const channel = supabase
      .channel(`servicos-notificacoes:${colaboradorId}:${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'gestao_servicos',
          table: 'notificacoes',
          filter: `colaborador_id=eq.${colaboradorId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: notificacoesKey });
          const notificacao = payload.new || {};
          // Toda notificacao relevante pra este colaborador tambem significa que uma
          // solicitacao mudou (aprovada, reprovada, paga, cancelada, nova pendente...) -- sem
          // isso, quem esta com a lista aberta so via o status novo depois de um F5.
          if (notificacao.referencia_tipo === 'solicitacao_pagamento') {
            queryClient.invalidateQueries({ queryKey: ['servicos', 'solicitacoes'] });
          }
          if (notificacao.titulo) {
            toast({ title: notificacao.titulo, description: notificacao.mensagem || undefined });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [colaboradorId, instanceId, queryClient, toast]);

  function handleAbrirNotificacao(notificacao) {
    if (!notificacao.lida_em) marcarLidaMutation.mutate(notificacao.id);
    setOpen(false);
    if (notificacao.link) navigate(notificacao.link);
  }

  if (!colaboradorId) return null;

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((current) => !current)}
        aria-label="Notificacoes"
        className={`relative ${buttonClassName}`}
      >
        <Bell className="h-4 w-4" />
        {naoLidas.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
            {naoLidas.length > 9 ? '9+' : naoLidas.length}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 flex max-h-[70vh] flex-col overflow-hidden rounded-md border border-border bg-card shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:h-[420px] sm:max-h-none sm:w-[340px]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-bold">Notificações</h2>
            <div className="flex items-center gap-3">
              {push.supported && push.permission !== 'denied' && (
                <button
                  type="button"
                  disabled={push.loading}
                  onClick={() => (push.subscribed ? push.unsubscribe() : push.subscribe())}
                  title={
                    push.subscribed
                      ? 'Desativar notificacoes com o app fechado'
                      : 'Ativar notificacoes com o app fechado'
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {push.subscribed ? <BellRing className="h-3.5 w-3.5 text-primary" /> : <BellOff className="h-3.5 w-3.5" />}
                </button>
              )}
              {naoLidas.length > 0 && (
                <button
                  type="button"
                  onClick={() => marcarTodasLidasMutation.mutate()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Marcar todas
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {notificacoes.length === 0 ? (
              <p className="p-3 text-center text-sm text-muted-foreground">Nenhuma notificação ainda.</p>
            ) : (
              <div className="space-y-4">
                {naoLidas.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Não lidas
                    </h3>
                    {naoLidas.map((notificacao) => (
                      <NotificationItem
                        key={notificacao.id}
                        notificacao={notificacao}
                        onClick={() => handleAbrirNotificacao(notificacao)}
                      />
                    ))}
                  </div>
                )}

                {lidas.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      Lidas
                    </h3>
                    {lidas.map((notificacao) => (
                      <NotificationItem
                        key={notificacao.id}
                        notificacao={notificacao}
                        onClick={() => handleAbrirNotificacao(notificacao)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({ notificacao, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
        notificacao.lida_em
          ? 'border-border hover:bg-accent'
          : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-[13px] font-semibold leading-4">{notificacao.titulo}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatNotificacaoData(notificacao.criado_em)}
        </span>
      </span>
      {notificacao.mensagem && (
        <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">{notificacao.mensagem}</span>
      )}
    </button>
  );
}
