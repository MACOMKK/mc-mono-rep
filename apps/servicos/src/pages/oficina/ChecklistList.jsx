import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Badge, Button, Spinner, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';

const STATUS_LABEL = {
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT = {
  em_andamento: 'warning',
  finalizado: 'success',
};

export default function ChecklistList() {
  const { user } = useAuth();
  const [busca, setBusca] = useState('');

  const { data: checklists = [], isLoading, isError } = useQuery({
    queryKey: ['oficina', 'checklists'],
    queryFn: () => oficinaApi.checklists.list(),
  });

  const filtrados = useMemo(() => {
    if (!busca.trim()) return checklists;
    const termo = busca.trim().toLowerCase();
    return checklists.filter((item) =>
      [item.cliente_nome, item.veiculo_placa, item.veiculo_chassi, item.colaborador_nome]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [checklists, busca]);

  const { page, setPage, pageItems, total, pageSize } = usePagination(filtrados, 15);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Checklists de inspeção</h1>
          <p className="text-sm text-muted-foreground">Vistorias de veículos realizadas na oficina.</p>
        </div>
        {user?.isOficinaInspetor && (
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Novo checklist
          </Button>
        )}
      </div>

      <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por cliente, placa ou chassi..." className="md:max-w-sm" />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os checklists.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Veículo</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entrada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((item) => (
                <TableRow key={item.id} className="cursor-pointer">
                  <TableCell>{item.numero}</TableCell>
                  <TableCell>{item.cliente_nome || '—'}</TableCell>
                  <TableCell>{item.veiculo_placa || item.veiculo_chassi || '—'}</TableCell>
                  <TableCell>{item.colaborador_nome || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[item.status] || 'default'}>
                      {STATUS_LABEL[item.status] || item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(item.data_entrada).toLocaleDateString('pt-BR')}</TableCell>
                </TableRow>
              ))}
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Nenhum checklist encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="checklist(s)" />
        </>
      )}
    </div>
  );
}
