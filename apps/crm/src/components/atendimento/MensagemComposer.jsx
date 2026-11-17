import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, FileText, Lock, Mic, Paperclip, Settings, SendHorizontal, Smile, Sparkles, Square, Trash2, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { crmDataClient } from '@/api/crmDataClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EnviarTemplateDialog from './EnviarTemplateDialog';
import GerenciarMensagensRapidasDialog from './GerenciarMensagensRapidasDialog';

// Conjunto curado (sem lib de picker nova) -- cobre as reacoes/expressoes mais comuns num chat de
// atendimento. Pode crescer, mas o objetivo aqui e' cobertura pratica, nao o unicode completo.
const EMOJIS_RAPIDOS = [
  '😀', '😁', '😂', '🙂', '😉', '😊', '😍', '😘',
  '😎', '🤔', '😅', '😢', '😭', '😡', '😱', '🥳',
  '👍', '👎', '🙏', '👏', '🤝', '💪', '✅', '❌',
  '❤️', '🔥', '🎉', '⭐', '⏰', '📅', '📞', '💰',
];

// Mesmo limite do bucket crm-atendimento-midia (storage.buckets.file_size_limit, ver migration
// 20261109140000_add_crm_atendimento_midia.sql) -- falhar aqui evita gastar o upload so pra
// descobrir no servidor que o arquivo nao cabe.
const MIDIA_TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

function tipoFromMime(mimeType) {
  if (mimeType?.startsWith('image/')) return 'imagem';
  if (mimeType?.startsWith('audio/')) return 'audio';
  return 'documento';
}

function fileParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function formatTempoGravacao(segundosTotais) {
  const minutos = Math.floor(segundosTotais / 60);
  const segundos = segundosTotais % 60;
  return `${minutos}:${String(segundos).padStart(2, '0')}`;
}

// Mesma ordem de preferencia do MDN pra Opus -- webm e' o mais suportado nos navegadores
// desktop/Android, ogg cobre o que faltar. Sem fallback explicito, o browser usa o mimeType
// default do MediaRecorder (geralmente webm tambem).
const MIME_TYPES_AUDIO_GRAVACAO = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

function mimeTypeSuportadoParaGravacao() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_TYPES_AUDIO_GRAVACAO.find((tipo) => MediaRecorder.isTypeSupported?.(tipo)) || '';
}

const RESPONDE_A_AUTOR_LABEL = {
  ia: 'IA',
  humano: 'Você',
  cliente: 'Cliente',
};

export default function MensagemComposer({
  onSend,
  onSendMidia,
  onSendTemplate,
  disabled,
  foraDaJanela,
  providerWhatsapp,
  respondendoA,
  onCancelarResposta,
}) {
  // foraDaJanela (API oficial Meta, janela de 24h sem mensagem do cliente): bloqueia texto/midia
  // livre, mas o botao de template (onSendTemplate) continua liberado -- e' o unico tipo de envio
  // que a Meta aceita fora da janela. disabled (conversa encerrada) bloqueia tudo, inclusive template.
  const bloqueiaTexto = disabled || foraDaJanela;
  const [value, setValue] = useState('');
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  // Imagem selecionada aguardando confirmacao (legenda opcional) antes do envio -- WhatsApp
  // suporta legenda em imagem (campo "texto" no envio de midia, ver send_atendimento_mensagem
  // no crm-api), mas so faz sentido pedir pro atendente digitar antes de mandar, nao depois.
  // Audio/documento continuam enviando direto, sem essa etapa.
  const [anexoPendente, setAnexoPendente] = useState(null);
  const [legendaAnexo, setLegendaAnexo] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [enviandoTemplate, setEnviandoTemplate] = useState(false);
  const [gerenciarRapidasOpen, setGerenciarRapidasOpen] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingCanceladaRef = useRef(false);

  // Mesma query key que GerenciarMensagensRapidasDialog usa pra invalidar -- criar/editar/excluir
  // ali reflete aqui sem precisar fechar o dropdown.
  const { data: mensagensRapidas = [] } = useQuery({
    queryKey: ['crm-mensagens-rapidas'],
    queryFn: () => crmDataClient.entities.MensagemRapida.list('titulo', 500),
  });

  const handleTemplateSelect = (texto) => {
    setValue(texto);
    textareaRef.current?.focus();
  };

  const handleEmojiSelect = (emoji) => {
    setValue((atual) => atual + emoji);
    textareaRef.current?.focus();
  };

  const encerrarStreamGravacao = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  // onstop e' assincrono em relacao ao clique que o disparou -- so assim sabemos se o usuario
  // pediu "enviar" ou "cancelar" nesse momento, por isso o flag fica numa ref (nao re-renderiza).
  const handleGravacaoFinalizada = async (mimeType) => {
    encerrarStreamGravacao();
    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    if (recordingCanceladaRef.current || chunks.length === 0) return;

    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
    if (blob.size === 0) return;
    if (blob.size > MIDIA_TAMANHO_MAXIMO_BYTES) {
      toast({
        title: 'Áudio muito longo',
        description: 'O limite para anexos é de 25 MB.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const base64 = await fileParaBase64(blob);
      await onSendMidia({
        file: blob,
        base64,
        mimeType: blob.type || mimeType || 'audio/webm',
        nomeArquivo: null,
        tipo: 'audio',
      }).catch(() => {});
    } catch {
      toast({
        title: 'Falha ao preparar o áudio',
        description: 'Tente gravar novamente.',
        variant: 'destructive',
      });
    }
  };

  const startRecording = async () => {
    if (bloqueiaTexto || isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = mimeTypeSuportadoParaGravacao();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordingStreamRef.current = stream;
      recordingCanceladaRef.current = false;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => handleGravacaoFinalizada(recorder.mimeType || mimeType);
      mediaRecorderRef.current = recorder;

      recorder.start();
      setRecordingSeconds(0);
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((atual) => atual + 1), 1000);
    } catch {
      toast({
        title: 'Não foi possível acessar o microfone',
        description: 'Verifique a permissão do navegador para este site.',
        variant: 'destructive',
      });
    }
  };

  const pararGravacao = ({ cancelar }) => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingCanceladaRef.current = cancelar;
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      encerrarStreamGravacao();
    };
  }, []);

  // Revoga o object URL anterior sempre que troca/some o anexo pendente -- a ordem de cleanup
  // do React (antes do proximo efeito, e no unmount) garante que isso cobre as duas situacoes.
  useEffect(() => {
    return () => {
      if (anexoPendente?.previewUrl) URL.revokeObjectURL(anexoPendente.previewUrl);
    };
  }, [anexoPendente]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || bloqueiaTexto) return;

    // onSend (enviarMutation) ja atualiza a lista de mensagens otimisticamente em onMutate --
    // nao esperar a confirmacao do servidor aqui, senao o campo trava entre mensagens em
    // sequencia. Erro de envio e tratado no onError da mutation (toast + rollback do cache).
    setValue('');
    onSend(trimmed).catch(() => {});
  };

  const handleAnexoSelecionado = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || bloqueiaTexto) return;

    if (file.size > MIDIA_TAMANHO_MAXIMO_BYTES) {
      toast({
        title: 'Arquivo muito grande',
        description: 'O limite para anexos é de 25 MB.',
        variant: 'destructive',
      });
      return;
    }

    const tipo = tipoFromMime(file.type);
    const midia = {
      file,
      base64: await fileParaBase64(file).catch(() => null),
      mimeType: file.type || 'application/octet-stream',
      nomeArquivo: file.name,
      tipo,
    };
    if (midia.base64 === null) {
      toast({
        title: 'Falha ao preparar o arquivo',
        description: 'Tente selecionar o arquivo novamente.',
        variant: 'destructive',
      });
      return;
    }

    // Imagem para' aqui pro atendente poder digitar uma legenda antes de enviar -- ver
    // handleEnviarAnexoPendente. Audio/documento continuam indo direto, sem essa etapa.
    if (tipo === 'imagem') {
      setAnexoPendente({ ...midia, previewUrl: URL.createObjectURL(file) });
      setLegendaAnexo('');
      return;
    }

    setEnviandoAnexo(true);
    try {
      // onSendMidia (enviarMutation) tambem ja atualiza a bolha otimista em onMutate -- mesmo
      // padrao de handleSend, so que aqui espera o FileReader (assincrono) antes de disparar.
      await onSendMidia(midia, '').catch(() => {});
    } finally {
      setEnviandoAnexo(false);
    }
  };

  const handleCancelarAnexoPendente = () => {
    setAnexoPendente(null);
    setLegendaAnexo('');
  };

  const handleEnviarAnexoPendente = async () => {
    if (!anexoPendente) return;
    const { previewUrl, ...midia } = anexoPendente;
    const legenda = legendaAnexo.trim();
    setAnexoPendente(null);
    setLegendaAnexo('');
    setEnviandoAnexo(true);
    try {
      await onSendMidia(midia, legenda).catch(() => {});
    } finally {
      setEnviandoAnexo(false);
    }
  };

  const handleEnviarTemplate = async (template) => {
    setEnviandoTemplate(true);
    try {
      await onSendTemplate(template);
      setTemplateDialogOpen(false);
    } catch {
      // Erro ja e' tratado (toast) no onError da mutation em Atendimento.jsx -- so mantem o
      // dialogo aberto pra o atendente poder tentar de novo sem reabrir e re-selecionar tudo.
    } finally {
      setEnviandoTemplate(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (respondendoA) textareaRef.current?.focus();
  }, [respondendoA]);

  return (
    <div className="flex flex-col border-t border-border bg-card">
      {/* Janela de 24h so existe na API oficial (Meta) -- Evolution nao tem essa restricao (ver
          CLAUDE.md do crm), por isso o aviso so aparece com esse provedor ativo. Antes disso a
          unica pista de "fechada" era o placeholder do textarea, que ninguem notava; agora fica
          visivel tambem quando a janela esta ABERTA, pra nao parecer que a informacao desapareceu. */}
      {providerWhatsapp === 'meta' && !disabled ? (
        <div
          className={cn(
            'flex items-center gap-1.5 border-b px-3 py-1.5 text-[11px] font-medium',
            foraDaJanela
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800',
          )}
        >
          {foraDaJanela ? <Lock className="h-3 w-3 shrink-0" /> : <Clock className="h-3 w-3 shrink-0" />}
          <span>
            {foraDaJanela
              ? 'Janela de 24h fechada — envie um template aprovado para retomar a conversa'
              : 'Janela de 24h aberta — pode responder normalmente até 24h após a última mensagem do cliente'}
          </span>
        </div>
      ) : null}
      {anexoPendente ? (
        <div className="flex items-end gap-3 border-b border-border p-3">
          <img
            src={anexoPendente.previewUrl}
            alt={anexoPendente.nomeArquivo || 'Imagem'}
            className="h-20 w-20 shrink-0 rounded-md border border-border object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Textarea
              value={legendaAnexo}
              onChange={(event) => setLegendaAnexo(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  handleEnviarAnexoPendente();
                }
              }}
              placeholder="Adicionar uma legenda (opcional)..."
              rows={1}
              autoFocus
              className="min-h-0 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" disabled={enviandoAnexo} onClick={handleCancelarAnexoPendente}>
                Cancelar
              </Button>
              <Button type="button" size="sm" disabled={enviandoAnexo} onClick={handleEnviarAnexoPendente}>
                <SendHorizontal className="mr-1.5 h-3.5 w-3.5" />
                Enviar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {respondendoA ? (
        <div className="flex items-center gap-2 border-b border-border px-3 pt-2.5">
          <div className="min-w-0 flex-1 rounded-md border-l-2 border-primary bg-muted px-2.5 py-1.5 text-xs">
            <p className="font-semibold text-primary">{RESPONDE_A_AUTOR_LABEL[respondendoA.autor] || 'Mensagem'}</p>
            <p className="truncate text-muted-foreground">{respondendoA.conteudo || '[Mídia]'}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            aria-label="Cancelar resposta"
            onClick={onCancelarResposta}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2 p-3">
      <div className="flex min-h-11 flex-1 items-center gap-1 rounded-full bg-muted pl-1.5 pr-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleAnexoSelecionado}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          disabled={bloqueiaTexto || enviandoAnexo || isRecording}
          aria-label="Anexar arquivo"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              disabled={bloqueiaTexto || isRecording}
              aria-label="Emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            <div className="grid grid-cols-8 gap-1">
              {EMOJIS_RAPIDOS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-muted"
                  onClick={() => handleEmojiSelect(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              disabled={bloqueiaTexto || isRecording}
              aria-label="Respostas rápidas"
            >
              <Zap className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            {mensagensRapidas.length === 0 ? (
              <DropdownMenuItem disabled className="whitespace-normal text-xs text-muted-foreground">
                Nenhuma mensagem rápida cadastrada.
              </DropdownMenuItem>
            ) : (
              mensagensRapidas.map((mensagem) => (
                <DropdownMenuItem
                  key={mensagem.id}
                  className="flex flex-col items-start gap-0.5 whitespace-normal"
                  onSelect={() => handleTemplateSelect(mensagem.texto)}
                >
                  <span className="text-xs font-semibold">{mensagem.titulo}</span>
                  <span className="text-xs text-muted-foreground">{mensagem.texto}</span>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-xs"
              onSelect={() => setGerenciarRapidasOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              Gerenciar mensagens rápidas...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onSendTemplate ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground"
            disabled={disabled || isRecording}
            aria-label="Enviar template"
            onClick={() => setTemplateDialogOpen(true)}
          >
            <FileText className="h-4 w-4" />
          </Button>
        ) : null}
        {isRecording ? (
          <div className="flex flex-1 items-center gap-2 py-1.5 text-sm text-muted-foreground">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
            <span>Gravando áudio... {formatTempoGravacao(recordingSeconds)}</span>
          </div>
        ) : (
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              foraDaJanela && !disabled
                ? 'Fora da janela de 24h — use o botão de template para enviar'
                : 'Digite uma mensagem...'
            }
            rows={1}
            className="min-h-0 flex-1 resize-none border-none bg-transparent py-1.5 shadow-none focus-visible:ring-0"
            disabled={bloqueiaTexto}
          />
        )}
      </div>
      {/* Sugestao de resposta por IA: visual, sem funcionalidade ainda. */}
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" disabled aria-label="Sugestao de IA (em breve)">
        <Sparkles className="h-4 w-4" />
      </Button>
      {isRecording && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          aria-label="Cancelar gravação"
          onClick={() => pararGravacao({ cancelar: true })}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
      <Button
        className={`h-9 w-9 shrink-0 rounded-full ${
          isRecording ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-foreground text-background hover:bg-foreground/90'
        }`}
        size="icon"
        onClick={() => {
          if (isRecording) pararGravacao({ cancelar: false });
          else if (value.trim()) handleSend();
          else startRecording();
        }}
        disabled={bloqueiaTexto}
        aria-label={isRecording ? 'Parar e enviar áudio' : value.trim() ? 'Enviar' : 'Gravar áudio'}
      >
        {isRecording ? (
          <Square className="h-4 w-4 fill-current" />
        ) : value.trim() ? (
          <SendHorizontal className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
      </div>
      {onSendTemplate ? (
        <EnviarTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          onEnviar={handleEnviarTemplate}
          isPending={enviandoTemplate}
        />
      ) : null}
      <GerenciarMensagensRapidasDialog open={gerenciarRapidasOpen} onOpenChange={setGerenciarRapidasOpen} />
    </div>
  );
}
