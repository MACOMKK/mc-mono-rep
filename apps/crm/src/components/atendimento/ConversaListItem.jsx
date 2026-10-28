import { Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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

export default function ConversaListItem({ conversa, isActive, onClick }) {
  const titulo = conversa.cliente_nome || formatTelefone(conversa.telefone_normalizado);
  const naoLida = Boolean(conversa.nao_lida);
  const sigla = iniciais(conversa.cliente_nome);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full gap-3 border-b border-border px-3 py-3 text-left hover:bg-accent/40',
        isActive && 'border-l-4 border-l-primary bg-accent',
      )}
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
          {sigla || <Phone className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 truncate text-sm font-bold">
            {naoLida ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Mensagem nao lida" />
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
          <Badge className={cn('rounded-full text-[10px] font-semibold uppercase tracking-wide', STATUS_STYLES[conversa.status])}>
            {STATUS_LABEL[conversa.status] || conversa.status}
          </Badge>
        </div>
      </div>
    </button>
  );
}
