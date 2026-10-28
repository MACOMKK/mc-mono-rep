import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

const AUTOR_LABEL = {
  ia: '🤖 IA',
  humano: 'Você',
  cliente: null,
};

function formatHora(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function MensagemBubble({ mensagem }) {
  const isSaida = mensagem.direcao === 'saida';
  const isIa = mensagem.autor === 'ia';
  const label = AUTOR_LABEL[mensagem.autor];
  const isPending = Boolean(mensagem.pending);

  return (
    <div className={cn('flex w-full items-end gap-2', isSaida ? 'justify-end' : 'justify-start')}>
      {isIa ? (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <div className={cn('flex max-w-[70%] flex-col', isSaida ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm shadow-sm',
            isSaida ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-white text-foreground',
            isPending && 'opacity-60',
          )}
        >
          {label ? (
            <p className={cn('mb-0.5 text-[10px] font-bold uppercase tracking-wide', isSaida ? 'text-white/70' : 'text-muted-foreground')}>
              {label}
            </p>
          ) : null}
          <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
        </div>
        <span className="mt-0.5 text-[10px] text-muted-foreground">
          {isPending ? 'Enviando...' : formatHora(mensagem.created_date)}
        </span>
      </div>
    </div>
  );
}
