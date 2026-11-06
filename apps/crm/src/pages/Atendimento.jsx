import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MessageCircle,
  Phone,
  Search,
  UserCheck,
  CheckCheck,
  ArrowDown,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { atendimentoApi } from '@/api/atendimentoApi';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import ConversaListItem, { SlaPendenteBadge } from '@/components/atendimento/ConversaListItem';
import ConversaPainelLateral from '@/components/atendimento/ConversaPainelLateral';
import MensagemBubble from '@/components/atendimento/MensagemBubble';
import MensagemComposer from '@/components/atendimento/MensagemComposer';

const SCROLL_BOTTOM_THRESHOLD = 120;

// A Evolution API local (ver GUIA_TESTE_WHATSAPP_EVOLUTION_LOCAL.md) trava sob rajada de envios
// rapidos (ex.: 4-5 mensagens em sequencia) -- retry automatico evita que o atendente precise
// clicar manualmente em "tentar novamente" pra cada falha transitoria (timeout/rede), e o
// intervalo minimo entre envios da fila evita bombardear a sessao Baileys/Evolution tao rapido
// quanto o atendente digita.
const RETRY_MAX_TENTATIVAS = 2;
const RETRY_DELAY_MS = 1500;
const INTERVALO_MINIMO_FILA_MS = 1200;

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enviarComRetry(payload) {
  let ultimoErro;
  for (let tentativa = 0; tentativa <= RETRY_MAX_TENTATIVAS; tentativa += 1) {
    try {
      return await atendimentoApi.enviarMensagemManual(payload);
    } catch (error) {
      ultimoErro = error;
      if (tentativa < RETRY_MAX_TENTATIVAS) {
        await aguardar(RETRY_DELAY_MS * (tentativa + 1));
      }
    }
  }
  throw ultimoErro;
}

const FILTROS_CONVERSA = [
  { value: 'todas', label: 'Todas' },
  { value: 'nao_lidas', label: 'Não lidas' },
  { value: 'minhas', label: 'Minhas' },
  { value: 'sem_responsavel', label: 'Sem responsável' },
];

function iniciais(nome = '') {
  return nome
    .trim()
    .split(/\s+/)
    .filter((parte) => /^\p{L}/u.test(parte))
    .map((parte) => parte[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function filtrarConversas(conversas, filtro, usuarioId) {
  switch (filtro) {
    case 'nao_lidas':
      return conversas.filter((conversa) => conversa.nao_lida);
    case 'minhas':
      return conversas.filter((conversa) => conversa.responsavel_id && conversa.responsavel_id === usuarioId);
    case 'sem_responsavel':
      return conversas.filter((conversa) => !conversa.responsavel_id);
    default:
      return conversas;
  }
}

function buscarConversas(conversas, termo) {
  const termoNormalizado = termo.trim().toLowerCase();
  if (!termoNormalizado) return conversas;
  const digitosTermo = termo.replace(/\D/g, '');

  return conversas.filter((conversa) => {
    const nome = (conversa.cliente_nome || '').toLowerCase();
    const telefone = conversa.telefone_normalizado || '';
    const preview = (conversa.ultima_mensagem_preview || '').toLowerCase();

    if (nome.includes(termoNormalizado) || preview.includes(termoNormalizado)) return true;
    if (digitosTermo && telefone.includes(digitosTermo)) return true;
    return false;
  });
}

export default function Atendimento() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [conversaId, setConversaId] = useState(null);
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [buscaMensagensAberta, setBuscaMensagensAberta] = useState(false);
  const [buscaMensagens, setBuscaMensagens] = useState('');
  const [resultadoAtual, setResultadoAtual] = useState(0);
  const bottomRef = useRef(null);
  const scrollAreaRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const previousNaoLidaRef = useRef(new Map());
  const hasSeenConversasRef = useRef(false);
  const envioEmFilaRef = useRef(Promise.resolve());
  const mensagemRefs = useRef(new Map());

  const { data: conversas = [], isLoading: isLoadingConversas } = useQuery({
    queryKey: ['conversas-atendimento'],
    queryFn: () => atendimentoApi.listConversas(),
  });

  const conversaAtiva = conversas.find((item) => item.id === conversaId) || null;
  const conversasFiltradas = buscarConversas(filtrarConversas(conversas, filtro, user?.id), busca);

  const { data: mensagens = [], isLoading: isLoadingMensagens } = useQuery({
    queryKey: ['mensagens-atendimento', conversaId],
    queryFn: () => atendimentoApi.listMensagens(conversaId),
    enabled: Boolean(conversaId),
  });

  const termoBuscaMensagens = useDebouncedValue(buscaMensagens, 300).trim();

  const resultadosBusca = useMemo(() => {
    if (!termoBuscaMensagens) return [];
    const termoNormalizado = termoBuscaMensagens.toLowerCase();
    return mensagens.filter((mensagem) => mensagem.conteudo?.toLowerCase().includes(termoNormalizado));
  }, [mensagens, termoBuscaMensagens]);

  const resultadoFocado = resultadosBusca[resultadoAtual] || null;

  useEffect(() => {
    setResultadoAtual(0);
  }, [termoBuscaMensagens, conversaId]);

  useEffect(() => {
    if (!buscaMensagensAberta) {
      setBuscaMensagens('');
    }
  }, [conversaId, buscaMensagensAberta]);

  useEffect(() => {
    if (!resultadoFocado) return;
    const elemento = mensagemRefs.current.get(resultadoFocado.id);
    elemento?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [resultadoFocado]);

  const irParaProximoResultado = () => {
    if (resultadosBusca.length === 0) return;
    setResultadoAtual((atual) => (atual + 1) % resultadosBusca.length);
  };

  const irParaResultadoAnterior = () => {
    if (resultadosBusca.length === 0) return;
    setResultadoAtual((atual) => (atual - 1 + resultadosBusca.length) % resultadosBusca.length);
  };

  const fecharBuscaMensagens = () => {
    setBuscaMensagensAberta(false);
    setBuscaMensagens('');
  };

  const handleBuscaMensagensKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        irParaResultadoAnterior();
      } else {
        irParaProximoResultado();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      fecharBuscaMensagens();
    }
  };

  useEffect(() => {
    if (!conversaId && conversas.length > 0) {
      setConversaId(conversas[0].id);
    }
  }, [conversaId, conversas]);

  // Avisa (toast) quando chega mensagem nova em uma conversa que nao e' a aberta no momento --
  // sem isso o atendente so percebe olhando a lista o tempo todo.
  useEffect(() => {
    const previous = previousNaoLidaRef.current;
    if (hasSeenConversasRef.current) {
      conversas.forEach((conversa) => {
        const wasUnread = previous.get(conversa.id);
        if (conversa.nao_lida && !wasUnread && conversa.id !== conversaId) {
          toast({
            title: `Nova mensagem de ${conversa.cliente_nome || conversa.telefone_normalizado}`,
            description: conversa.ultima_mensagem_preview || undefined,
          });
        }
      });
    }
    previousNaoLidaRef.current = new Map(conversas.map((conversa) => [conversa.id, conversa.nao_lida]));
    hasSeenConversasRef.current = true;
  }, [conversas, conversaId]);

  // Marca a conversa aberta como lida (cobre tanto ao trocar de conversa quanto quando chega
  // mensagem nova na conversa que ja esta aberta).
  useEffect(() => {
    if (!conversaAtiva?.id || !conversaAtiva.nao_lida) return;
    atendimentoApi
      .marcarConversaLida(conversaAtiva.id)
      .then(() => {
        queryClient.setQueryData(['conversas-atendimento'], (old = []) =>
          old.map((item) => (item.id === conversaAtiva.id ? { ...item, nao_lida: false } : item)),
        );
      })
      .catch(() => {});
  }, [conversaAtiva?.id, conversaAtiva?.nao_lida, queryClient]);

  // Reseta o comportamento de scroll ao trocar de conversa -- sempre comeca colado no fim.
  useEffect(() => {
    stickToBottomRef.current = true;
    setShowJumpToBottom(false);
  }, [conversaId]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return undefined;

    const handleScroll = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const nearBottom = distanceFromBottom < SCROLL_BOTTOM_THRESHOLD;
      stickToBottomRef.current = nearBottom;
      setShowJumpToBottom(!nearBottom);
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [conversaId]);

  // So auto-rola pro fim se o atendente ja estava perto do fim -- evita interromper quem esta
  // lendo historico mais acima quando chega mensagem nova.
  useEffect(() => {
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
      setShowJumpToBottom(false);
    }
  }, [mensagens.length]);

  const handleRetryMensagem = (mensagemComErro) => {
    queryClient.setQueryData(['mensagens-atendimento', conversaId], (old = []) =>
      old.filter((item) => item.id !== mensagemComErro.id),
    );
    enviarMutation.mutate(mensagemComErro.conteudo);
  };

  const handleJumpToBottom = () => {
    stickToBottomRef.current = true;
    bottomRef.current?.scrollIntoView({ block: 'end' });
    setShowJumpToBottom(false);
  };

  const enviarMutation = useMutation({
    // onMutate roda sincrono na ordem de chamada de mutate(), mas o envio real (mutationFn) e
    // assincrono -- sem encadear aqui, 2+ envios em sequencia disparam requests em paralelo que
    // podem chegar ao servidor fora de ordem, embaralhando as mensagens no WhatsApp do cliente.
    // Encadear via envioEmFilaRef garante que o envio N+1 so sai depois do N terminar, preservando
    // a ordem, enquanto a UI continua liberando o campo na hora (otimista, em onMutate).
    // enviarComRetry tenta de novo (com backoff) falhas transitorias antes de desistir, e o
    // .then(() => aguardar(...)) so' libera o proximo item da fila depois do intervalo minimo --
    // as duas coisas juntas absorvem a instabilidade da Evolution API local sob rajada.
    mutationFn: (texto) => {
      const envio = envioEmFilaRef.current.then(
        () => enviarComRetry({ conversaId, texto }),
        () => enviarComRetry({ conversaId, texto }),
      );
      envioEmFilaRef.current = envio.catch(() => {}).then(() => aguardar(INTERVALO_MINIMO_FILA_MS));
      return envio;
    },
    onMutate: (texto) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Insere a bolha otimista sincronamente, antes de qualquer coisa assincrona: um onMutate
      // async que faz "await cancelQueries(...)" primeiro arrisca nunca chegar ao setQueryData se
      // esse await falhar/for interrompido (ex.: varios envios em sequencia cancelando a mesma
      // query quase ao mesmo tempo) -- nesse caso o React Query vai direto pro onError sem nunca
      // chamar mutationFn, e a mensagem desaparece sem jamais ter aparecido. cancelQueries so
      // existe para evitar que um refetch em voo pise na bolha otimista; disparar sem bloquear
      // o onMutate (e sem poder derruba-lo) preserva essa proteção sem esse risco.
      stickToBottomRef.current = true;
      queryClient.setQueryData(['mensagens-atendimento', conversaId], (old = []) => [
        ...old,
        {
          id: tempId,
          conversa_id: conversaId,
          direcao: 'saida',
          autor: 'humano',
          conteudo: texto,
          created_date: new Date().toISOString(),
          pending: true,
        },
      ]);
      queryClient.cancelQueries({ queryKey: ['mensagens-atendimento', conversaId] }).catch(() => {});

      return { tempId };
    },
    onError: (error, _texto, context) => {
      // Nao faz rollback completo (remover a bolha) -- ela fica visivel marcada como erro, com
      // botao de reenvio, senao a mensagem que falhou desaparece sem deixar rastro pro atendente.
      if (context?.tempId) {
        queryClient.setQueryData(['mensagens-atendimento', conversaId], (old = []) =>
          old.map((item) => (item.id === context.tempId ? { ...item, pending: false, erro: true } : item)),
        );
      }
      toast({ title: 'Erro ao enviar mensagem', description: error?.message, variant: 'destructive' });
    },
    onSuccess: (mensagemEnviada, _texto, context) => {
      // Nao usar invalidateQueries aqui: o refetch e assincrono e pode chegar do servidor antes
      // de envios seguintes (ainda em voo) terem sido persistidos, substituindo o array inteiro
      // do cache e apagando as bolhas otimistas (pending/erro) deles por baixo dos pes. Como o
      // mutationFn ja devolve a mensagem confirmada, so troca a entrada tempId por ela -- sem
      // tocar no resto do array, preservando qualquer envio ainda pendente.
      if (context?.tempId) {
        queryClient.setQueryData(['mensagens-atendimento', conversaId], (old = []) =>
          old.map((item) => (item.id === context.tempId ? { ...mensagemEnviada, pending: false } : item)),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['conversas-atendimento'] });
    },
  });

  const assumirMutation = useMutation({
    mutationFn: () => atendimentoApi.assumirConversa(conversaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversas-atendimento'] });
      toast({ title: 'Conversa assumida', description: 'A resposta automática da IA foi pausada.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao assumir conversa', description: error?.message, variant: 'destructive' });
    },
  });

  const encerrarMutation = useMutation({
    mutationFn: () => atendimentoApi.encerrarConversa(conversaId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversas-atendimento'] });
      toast({ title: 'Conversa encerrada' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao encerrar conversa', description: error?.message, variant: 'destructive' });
    },
  });

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-background">
        <div className="relative border-b border-border px-3 py-2.5">
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar nome, telefone ou mensagem..."
            className="h-9 pl-8 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/40 px-3 py-2.5">
          {FILTROS_CONVERSA.map((item) => (
            <Button
              key={item.value}
              type="button"
              size="sm"
              variant={filtro === item.value ? 'default' : 'outline'}
              className="h-7 rounded-full px-3 text-[11px] font-semibold"
              onClick={() => setFiltro(item.value)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <ScrollArea className="min-h-0 flex-1">
          {isLoadingConversas ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Carregando conversas...</p>
          ) : conversasFiltradas.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {conversas.length === 0
                ? 'Nenhuma conversa ainda.'
                : busca.trim()
                  ? 'Nenhuma conversa encontrada para essa busca.'
                  : 'Nenhuma conversa neste filtro.'}
            </p>
          ) : (
            conversasFiltradas.map((conversa) => (
              <ConversaListItem
                key={conversa.id}
                conversa={conversa}
                isActive={conversa.id === conversaId}
                onClick={() => setConversaId(conversa.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {!conversaAtiva ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle className="h-8 w-8" />
            <p className="text-sm">Selecione uma conversa para visualizar</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-4 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                    {iniciais(conversaAtiva.cliente_nome) || <Phone className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {conversaAtiva.cliente_nome || conversaAtiva.telefone_normalizado}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{conversaAtiva.telefone_normalizado}</p>
                </div>
                {conversaAtiva.sla_primeira_resposta_em && !conversaAtiva.primeira_resposta_humana_em ? (
                  <SlaPendenteBadge desde={conversaAtiva.sla_primeira_resposta_em} className="shrink-0" />
                ) : null}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setBuscaMensagensAberta((aberta) => !aberta)}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
                {conversaAtiva.status !== 'aguardando_humano' ? (
                  <Button
                    size="sm"
                    className="rounded-full"
                    onClick={() => assumirMutation.mutate()}
                    disabled={assumirMutation.isPending || conversaAtiva.status === 'encerrada'}
                  >
                    <UserCheck className="mr-1 h-3.5 w-3.5" />
                    Assumir
                  </Button>
                ) : null}
                {conversaAtiva.status !== 'encerrada' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => encerrarMutation.mutate()}
                    disabled={encerrarMutation.isPending}
                  >
                    <CheckCheck className="mr-1 h-3.5 w-3.5" />
                    Encerrar
                  </Button>
                ) : null}
              </div>
            </div>

            {buscaMensagensAberta ? (
              <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-2">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  autoFocus
                  value={buscaMensagens}
                  onChange={(event) => setBuscaMensagens(event.target.value)}
                  onKeyDown={handleBuscaMensagensKeyDown}
                  placeholder="Buscar nesta conversa..."
                  className="h-8 flex-1 text-sm"
                />
                {termoBuscaMensagens ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {resultadosBusca.length > 0 ? resultadoAtual + 1 : 0} de {resultadosBusca.length}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  disabled={resultadosBusca.length === 0}
                  onClick={irParaResultadoAnterior}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  disabled={resultadosBusca.length === 0}
                  onClick={irParaProximoResultado}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={fecharBuscaMensagens}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1 bg-muted/50">
              <ScrollArea ref={scrollAreaRef} className="h-full px-4 py-3">
                <div className="flex flex-col gap-3">
                  {isLoadingMensagens ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Carregando mensagens...</p>
                  ) : mensagens.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma mensagem nesta conversa ainda.</p>
                  ) : (
                    mensagens.map((mensagem) => (
                      <MensagemBubble
                        key={mensagem.id}
                        ref={(elemento) => {
                          if (elemento) {
                            mensagemRefs.current.set(mensagem.id, elemento);
                          } else {
                            mensagemRefs.current.delete(mensagem.id);
                          }
                        }}
                        mensagem={mensagem}
                        onRetry={handleRetryMensagem}
                        termoBusca={termoBuscaMensagens || null}
                        isResultadoAtual={mensagem.id === resultadoFocado?.id}
                      />
                    ))
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
              {showJumpToBottom ? (
                <Button
                  size="sm"
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md"
                  onClick={handleJumpToBottom}
                >
                  <ArrowDown className="mr-1 h-3.5 w-3.5" />
                  Novas mensagens
                </Button>
              ) : null}
            </div>

            <MensagemComposer
              onSend={(texto) => enviarMutation.mutateAsync(texto)}
              disabled={conversaAtiva.status === 'encerrada'}
            />
          </>
        )}
      </div>

      {conversaAtiva ? <ConversaPainelLateral conversa={conversaAtiva} /> : null}
    </div>
  );
}
