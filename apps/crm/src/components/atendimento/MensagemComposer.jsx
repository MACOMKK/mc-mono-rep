import { useState } from 'react';
import { SendHorizontal } from 'lucide-react';
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
    <div className="flex items-end gap-2 border-t border-border bg-card p-3">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Escreva uma resposta..."
        className="min-h-11 flex-1 resize-none rounded-md bg-muted"
        disabled={disabled || sending}
      />
      <Button
        className="rounded-full"
        size="icon"
        onClick={handleSend}
        disabled={disabled || sending || !value.trim()}
        aria-label="Enviar"
      >
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
