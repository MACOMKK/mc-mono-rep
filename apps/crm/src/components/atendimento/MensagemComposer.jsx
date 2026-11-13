import { useEffect, useRef, useState } from 'react';
import { FileText, Mic, Paperclip, SendHorizontal, Smile, Sparkles, Square, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import EnviarTemplateDialog from './EnviarTemplateDialog';

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

// Cadastro fixo por enquanto -- sem tela de configuracao ainda. Migrar para tabela propria se
// o uso pegar (ver plano de melhorias do chat de Atendimento).
const TEMPLATES_RESPOSTA_RAPIDA = [
  { titulo: 'Saudação', texto: 'Olá! Em que posso ajudar?' },
  { titulo: 'Horário de atendimento', texto: 'Nosso horário de atendimento é de segunda a sábado, das 8h às 18h.' },
  { titulo: 'Aguarde um momento', texto: 'Só um momento, vou verificar essa informação para você.' },
  { titulo: 'Encerramento', texto: 'Fico à disposição! Qualquer outra dúvida, é só chamar por aqui.' },
];

export default function MensagemComposer({ onSend, onSendMidia, onSendTemplate, disabled, foraDaJanela }) {
  // foraDaJanela (API oficial Meta, janela de 24h sem mensagem do cliente): bloqueia texto/midia
  // livre, mas o botao de template (onSendTemplate) continua liberado -- e' o unico tipo de envio
  // que a Meta aceita fora da janela. disabled (conversa encerrada) bloqueia tudo, inclusive template.
  const bloqueiaTexto = disabled || foraDaJanela;
  const [value, setValue] = useState('');
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [enviandoTemplate, setEnviandoTemplate] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordingCanceladaRef = useRef(false);

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

    setEnviandoAnexo(true);
    try {
      const base64 = await fileParaBase64(file);
      // onSendMidia (enviarMutation) tambem ja atualiza a bolha otimista em onMutate -- mesmo
      // padrao de handleSend, so que aqui espera o FileReader (assincrono) antes de disparar.
      await onSendMidia({
        file,
        base64,
        mimeType: file.type || 'application/octet-stream',
        nomeArquivo: file.name,
        tipo: tipoFromMime(file.type),
      }).catch(() => {});
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

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card p-3">
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
            {TEMPLATES_RESPOSTA_RAPIDA.map((template) => (
              <DropdownMenuItem
                key={template.titulo}
                className="flex flex-col items-start gap-0.5 whitespace-normal"
                onSelect={() => handleTemplateSelect(template.texto)}
              >
                <span className="text-xs font-semibold">{template.titulo}</span>
                <span className="text-xs text-muted-foreground">{template.texto}</span>
              </DropdownMenuItem>
            ))}
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
      {onSendTemplate ? (
        <EnviarTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          onEnviar={handleEnviarTemplate}
          isPending={enviandoTemplate}
        />
      ) : null}
    </div>
  );
}
