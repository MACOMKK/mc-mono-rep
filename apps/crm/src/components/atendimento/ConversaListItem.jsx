import { Phone } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

// Tags de interesse (ex.: modelo do veiculo mencionado na conversa) -- sem fonte real ainda,
// nao existe esse dado no schema (conversas_atendimento nao tem campo de tag/categoria).
// Mockado deterministicamente a partir do id so pra aproximar o visual de referencia (ver
// MOCK_TAGS em ConversaPainelLateral.jsx, mesmo espirito) -- trocar por dado de verdade quando
// existir.
const MOCK_TAGS_POOL = [['Triton'], ['SUV'], ['Triton', 'Preço'], ['Onix'], []];

function mockTagsFor(id = '') {
  const hash = String(id)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return MOCK_TAGS_POOL[hash % MOCK_TAGS_POOL.length];
}

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
  const tags = mockTagsFor(conversa.id);

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
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-full border-violet-200 bg-violet-50 px-2 py-0 text-[10px] font-semibold text-violet-700">
              {tag}
            </Badge>
          ))}
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
