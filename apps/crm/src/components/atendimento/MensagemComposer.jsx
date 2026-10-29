import { useState } from 'react';
import { Mic, Paperclip, SendHorizontal, Smile, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function MensagemComposer({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setValue('');
    } finally {
      setSending(false);
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
        {/* Anexo/emoji/acao rapida: visual, sem funcionalidade ainda -- so o envio de texto existe hoje. */}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" disabled aria-label="Anexar arquivo (em breve)">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" disabled aria-label="Emoji (em breve)">
          <Smile className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" disabled aria-label="Acoes rapidas (em breve)">
          <Zap className="h-4 w-4" />
        </Button>
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite uma mensagem..."
          rows={1}
          className="min-h-0 flex-1 resize-none border-none bg-transparent py-1.5 shadow-none focus-visible:ring-0"
          disabled={disabled || sending}
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
        disabled={disabled || sending || !value.trim()}
        aria-label="Enviar"
      >
        {value.trim() ? <SendHorizontal className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>
    </div>
  );
}
