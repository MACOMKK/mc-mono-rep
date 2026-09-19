import { Car } from 'lucide-react';

import { Badge } from '@macom/ui';

const STATUS_LABEL = {
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT = {
  em_andamento: 'warning',
  finalizado: 'success',
};

function ChecklistThumbnail({ item }) {
  if (item.foto_thumbnail_url) {
    return (
      <img
        src={item.foto_thumbnail_url}
        alt={item.cliente_nome || 'Veículo'}
        className="h-14 w-14 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Car className="h-5 w-5" />
    </span>
  );
}

export default function ChecklistRow({ item, onClick }) {
  const subtitulo = [item.veiculo_placa || item.veiculo_chassi, item.veiculo_modelo, item.os ? `O.S. ${item.os}` : null, item.colaborador_nome]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50" onClick={onClick}>
      <ChecklistThumbnail item={item} />
      <span className="w-10 shrink-0 text-sm font-semibold text-muted-foreground">Nº {item.numero}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{item.cliente_nome || '—'}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitulo || '—'}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="text-xs text-muted-foreground">
          {new Date(item.data_entrada).toLocaleDateString('pt-BR')}
        </span>
        <Badge variant={STATUS_VARIANT[item.status] || 'default'}>{STATUS_LABEL[item.status] || item.status}</Badge>
      </div>
    </div>
  );
}
