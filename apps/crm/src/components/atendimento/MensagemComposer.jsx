import { useRef, useState } from 'react';
import { Mic, Paperclip, SendHorizontal, Smile, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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

// Cadastro fixo por enquanto -- sem tela de configuracao ainda. Migrar para tabela propria se
// o uso pegar (ver plano de melhorias do chat de Atendimento).
const TEMPLATES_RESPOSTA_RAPIDA = [
  { titulo: 'Saudação', texto: 'Olá! Em que posso ajudar?' },
  { titulo: 'Horário de atendimento', texto: 'Nosso horário de atendimento é de segunda a sábado, das 8h às 18h.' },
  { titulo: 'Aguarde um momento', texto: 'Só um momento, vou verificar essa informação para você.' },
  { titulo: 'Encerramento', texto: 'Fico à disposição! Qualquer outra dúvida, é só chamar por aqui.' },
];

export default function MensagemComposer({ onSend, onSendMidia, disabled }) {
  const [value, setValue] = useState('');
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleTemplateSelect = (texto) => {
    setValue(texto);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    // onSend (enviarMutation) ja atualiza a lista de mensagens otimisticamente em onMutate --
    // nao esperar a confirmacao do servidor aqui, senao o campo trava entre mensagens em
    // sequencia. Erro de envio e tratado no onError da mutation (toast + rollback do cache).
    setValue('');
    onSend(trimmed).catch(() => {});
  };

  const handleAnexoSelecionado = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || disabled) return;

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

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 border-t border-border bg-card p-3">
      <div className="flex min-h-11 flex-1 items-center gap-1 rounded-full bg-muted pl-1.5 pr-3">
        {/* Emoji/acao rapida: visual, sem funcionalidade ainda. */}
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
          disabled={disabled || enviandoAnexo}
          aria-label="Anexar arquivo"
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" disabled aria-label="Emoji (em breve)">
          <Smile className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              disabled={disabled}
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
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          rows={1}
          className="min-h-0 flex-1 resize-none border-none bg-transparent py-1.5 shadow-none focus-visible:ring-0"
          disabled={disabled}
        />
      </div>
      {/* Sugestao de resposta por IA: visual, sem funcionalidade ainda. */}
      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" disabled aria-label="Sugestao de IA (em breve)">
        <Sparkles className="h-4 w-4" />
      </Button>
      <Button
        className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
        size="icon"
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Enviar"
      >
        {value.trim() ? <SendHorizontal className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    </div>
  );
}
