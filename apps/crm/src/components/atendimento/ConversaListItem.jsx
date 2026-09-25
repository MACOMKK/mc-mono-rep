import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_LABEL = {
  aberta: 'Aberta',
  aguardando_humano: 'Aguardando você',
  encerrada: 'Encerrada',
};

const STATUS_STYLES = {
  aberta: 'bg-blue-100 text-blue-700',
  aguardando_humano: 'bg-amber-100 text-amber-700',
  encerrada: 'bg-muted text-muted-foreground',
};

function formatHora(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatTelefone(telefone = '') {
  const digits = telefone.replace(/\D/g, '');
  if (digits.length < 10) return telefone;
  const ddd = digits.slice(-11, -9);
  const resto = digits.slice(-9);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

export default function ConversaListItem({ conversa, isActive, onClick }) {
  const titulo = conversa.cliente_nome || formatTelefone(conversa.telefone_normalizado);
  const naoLida = Boolean(conversa.nao_lida);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-accent/40',
        isActive && 'bg-accent',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-sm font-bold uppercase tracking-wide">
          {naoLida ? (
            <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Mensagem nao lida" />
          ) : null}
          <span className="truncate">{titulo}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatHora(conversa.ultima_mensagem_em)}</span>
      </div>
      {conversa.ultima_mensagem_preview ? (
        <p className={cn('truncate text-xs', naoLida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
          {conversa.ultima_mensagem_preview}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{formatTelefone(conversa.telefone_normalizado)}</span>
        <Badge className={cn('rounded-none text-[10px] uppercase tracking-wide', STATUS_STYLES[conversa.status])}>
          {STATUS_LABEL[conversa.status] || conversa.status}
        </Badge>
      </div>
    </button>
  );
}
