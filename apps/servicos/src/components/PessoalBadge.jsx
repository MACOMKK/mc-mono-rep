import { Lock } from 'lucide-react';
import { Badge } from '@macom/ui';

// Solicitacao pessoal: lembrete entre solicitante e aprovador, nao paga pela empresa e invisivel
// pro financeiro (ver apps/servicos/CLAUDE.md, "Solicitação pessoal").
export default function PessoalBadge({ className = '' }) {
  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1 border-violet-500/50 bg-violet-500/10 text-violet-600 dark:text-violet-400 ${className}`}
    >
      <Lock className="h-3 w-3" />
      Pessoal
    </Badge>
  );
}
