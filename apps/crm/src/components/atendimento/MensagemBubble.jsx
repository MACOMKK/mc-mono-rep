import { cn } from '@/lib/utils';

const AUTOR_LABEL = {
  ia: 'IA',
  humano: 'Você',
  cliente: null,
};

function formatHora(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function MensagemBubble({ mensagem }) {
  const isSaida = mensagem.direcao === 'saida';
  const label = AUTOR_LABEL[mensagem.autor];
  const isPending = Boolean(mensagem.pending);

  return (
    <div className={cn('flex w-full flex-col', isSaida ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-none border px-3 py-2 text-sm',
          isSaida ? 'border-transparent bg-[#1a1a1a] text-white' : 'border-border bg-white text-foreground',
          isPending && 'opacity-60',
        )}
      >
        {label ? (
          <p className={cn('mb-0.5 text-[10px] font-bold uppercase tracking-wide', isSaida ? 'text-white/60' : 'text-muted-foreground')}>
            {label}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{mensagem.conteudo}</p>
      </div>
      <span className="mt-0.5 text-[10px] text-muted-foreground">
        {isPending ? 'Enviando...' : formatHora(mensagem.created_date)}
      </span>
    </div>
  );
}
