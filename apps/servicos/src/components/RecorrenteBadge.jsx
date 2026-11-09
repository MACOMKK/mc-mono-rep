import { Repeat } from 'lucide-react';
import { Badge } from '@macom/ui';

// Conta recorrente (mensal): ao ser paga, gera a ocorrencia do mes seguinte aguardando valor
// (ver apps/servicos/PLANO_RECORRENCIA_FINANCEIRO.md).
export default function RecorrenteBadge({ className = '' }) {
  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1 border-sky-500/50 bg-sky-500/10 text-sky-600 dark:text-sky-400 ${className}`}
    >
      <Repeat className="h-3 w-3" />
      Recorrente
    </Badge>
  );
}
