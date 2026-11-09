import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { Badge } from '@macom/ui';
import PessoalBadge from '@/components/PessoalBadge';
import RecorrenteBadge from '@/components/RecorrenteBadge';
import { formatDataVencimento, formatValor, truncarTitulo } from '@/lib/financeiroFormat';

// Card usado como fallback de <Table> em telas estreitas (md:hidden) nas listagens de
// solicitacoes (MinhasSolicitacoes, Aprovacoes, Pagamentos) -- mesmo `row` da tabela, so muda a
// marcacao. `badges`/`actions` ficam a cargo de cada tela pra nao acoplar esse componente ao
// status/acoes especificas de cada uma.
export default function SolicitacaoCard({
  row,
  onClick,
  showSolicitante = false,
  showRecorrente = false,
  showAprovador = false,
  badges,
  actions,
  pendenciaMotivo,
  pendenciaAtualizada = false,
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick(event);
      }}
      className={`overflow-hidden rounded-lg border bg-card active:bg-accent/50 ${
        pendenciaMotivo ? (pendenciaAtualizada ? 'border-2 border-amber-500' : 'border-2 border-destructive') : 'border-border'
      }`}
    >
      {pendenciaMotivo && (
        <div
          className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium ${
            pendenciaAtualizada ? 'bg-amber-500 text-white' : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {pendenciaAtualizada ? (
            <RefreshCw className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{pendenciaAtualizada ? 'Corrigido pelo solicitante — revisar' : pendenciaMotivo}</span>
        </div>
      )}
      <div className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug" title={row.titulo || '-'}>
          {truncarTitulo(row.titulo)}
        </p>
        <p className="shrink-0 text-sm font-semibold">{row.status === 'rascunho' ? '—' : formatValor(row.valor)}</p>
      </div>

      {((showSolicitante && row.solicitante_nome) || (showAprovador && row.aprovador_destino_nome)) && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {showSolicitante && row.solicitante_nome && <span className="truncate">{row.solicitante_nome}</span>}
          {showSolicitante && row.solicitante_nome && showAprovador && row.aprovador_destino_nome && (
            <ArrowRight className="h-3 w-3 shrink-0" />
          )}
          {showAprovador && row.aprovador_destino_nome && (
            <Badge variant="info" className="shrink-0 truncate font-normal">
              {row.aprovador_destino_nome}
            </Badge>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {row.pessoal && <PessoalBadge />}
        {showRecorrente && row.recorrente && <RecorrenteBadge />}
        <Badge variant="outline" className="shrink-0">
          {formatDataVencimento(row.vencimento_efetivo)}
        </Badge>
        {row.fornecedor && <span>{row.fornecedor}</span>}
        {row.categoria && (
          <>
            <span>·</span>
            <span>{row.categoria}</span>
          </>
        )}
      </div>

      {badges && <div className="flex flex-wrap items-center gap-1">{badges}</div>}

      {actions && (
        <div className="flex justify-end gap-2 border-t border-border/60 pt-2" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      )}
      </div>
    </div>
  );
}
