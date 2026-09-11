import { Button } from '@macom/ui';

export default function Pagination({ page, pageSize, total, onPageChange, itemLabel = 'item(ns)' }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : Math.max(1, (page - 1) * pageSize + 1);
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-muted-foreground">
        {total > 0 ? `Mostrando ${start}-${end} de ${total} ${itemLabel}` : `Nenhum ${itemLabel} encontrado`}
      </p>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Pagina {page} de {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Proxima
        </Button>
      </div>
    </div>
  );
}
