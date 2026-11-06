import { useEffect, useState } from 'react';
import { Clock, Headset, Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SLA_ALERTA_MINUTOS = 10;

function formatTempoDecorrido(desde) {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000));
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return minutosRestantes > 0 ? `há ${horas}h ${minutosRestantes}min` : `há ${horas}h`;
}

export function SlaPendenteBadge({ desde, className }) {
  const [, forcarAtualizacao] = useState(0);

  useEffect(() => {
    const intervalo = setInterval(() => forcarAtualizacao((valor) => valor + 1), 30000);
    return () => clearInterval(intervalo);
  }, []);

  const minutos = Math.floor((Date.now() - new Date(desde).getTime()) / 60000);
  const estourado = minutos >= SLA_ALERTA_MINUTOS;

  return (
    <Badge
      variant="outline"
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0 text-[10px] font-semibold',
        estourado ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-700',
        className,
      )}
    >
      <Clock className="h-2.5 w-2.5" />
      {formatTempoDecorrido(desde)}
    </Badge>
  );
}

const STATUS_LABEL = {
  aberta: 'Novo',
  aguardando_humano: 'Aguardando você',
  encerrada: 'Encerrada',
};

const STATUS_STYLES = {
  aberta: 'border-blue-200 bg-blue-50 text-blue-700',
  aguardando_humano: 'border-amber-200 bg-amber-50 text-amber-700',
  encerrada: 'border-border bg-muted text-muted-foreground',
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
  const tags = conversa.tags || [];
  const slaPendente = Boolean(conversa.sla_primeira_resposta_em) && !conversa.primeira_resposta_humana_em;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full gap-3 border-b border-border px-3 py-3 text-left transition-colors hover:bg-accent/40',
        isActive && 'border-l-4 border-l-primary bg-accent',
      )}
    >
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarFallback className="bg-foreground text-xs font-bold text-background">
          {sigla || <Phone className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold">{titulo}</span>
          <span className="shrink-0 text-[11px] text-muted-foreground">{formatHora(conversa.ultima_mensagem_em)}</span>
        </div>
        {conversa.ultima_mensagem_preview ? (
          <p className={cn('truncate text-xs', naoLida ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
            {conversa.ultima_mensagem_preview}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <Phone className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="WhatsApp" />
          <Badge variant="outline" className={cn('rounded-full px-2 py-0 text-[10px] font-semibold', STATUS_STYLES[conversa.status])}>
            {STATUS_LABEL[conversa.status] || conversa.status}
          </Badge>
          {slaPendente ? <SlaPendenteBadge desde={conversa.sla_primeira_resposta_em} /> : null}
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-2 py-0 text-[10px] font-semibold text-violet-700">
              {tag}
            </Badge>
          ))}
          {conversa.atendente_nome ? (
            <Badge variant="outline" className="flex items-center gap-1 rounded-full border-emerald-200 bg-emerald-50 px-2 py-0 text-[10px] font-semibold text-emerald-700">
              <Headset className="h-2.5 w-2.5" />
              {conversa.atendente_nome}
            </Badge>
          ) : null}
          {naoLida ? (
            <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              1
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
