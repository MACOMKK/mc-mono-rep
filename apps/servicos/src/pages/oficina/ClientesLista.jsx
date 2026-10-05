import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, User } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Button, CarLoader, Dialog, DialogContent, DialogHeader, DialogTitle } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import { formatDocumento, formatTelefone } from '@/lib/oficinaFormat';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';
import { ClienteForm } from '@/components/oficina/ClienteVeiculoPicker';
import ClienteDetalheSheet from '@/components/oficina/ClienteDetalheSheet';

export default function ClientesLista() {
  const { user } = useAuth();
  const [busca, setBusca] = useState('');
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [clienteDetalheId, setClienteDetalheId] = useState(null);

  const {
    data: clientes = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['oficina', 'clientes'],
    queryFn: () => oficinaApi.clientes.listar(''),
  });

  const termo = busca.trim().toLowerCase();
  const termoDigitos = termo.replace(/\D/g, '');
  const filtrados = termo
    ? clientes.filter(
        (item) =>
          item.nome?.toLowerCase().includes(termo) ||
          item.email?.toLowerCase().includes(termo) ||
          (termoDigitos && (item.telefone?.includes(termoDigitos) || item.cpf_cnpj?.includes(termoDigitos))),
      )
    : clientes;

  const { page, setPage, pageItems, total, pageSize } = usePagination(filtrados, 15);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro compartilhado com o CRM.</p>
        </div>
        {user?.isOficinaInspetor && (
          <Button onClick={() => setCadastrarAberto(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Cadastrar cliente
          </Button>
        )}
      </div>

      <SearchInput
        value={busca}
        onChange={setBusca}
        placeholder="Buscar por nome, telefone, CPF/CNPJ ou e-mail..."
        className="md:max-w-sm"
      />

      {isLoading && <CarLoader inline />}

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os clientes.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {pageItems.map((item) => (
              <div
                key={item.id}
                className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"
                onClick={() => setClienteDetalheId(item.id)}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium uppercase">{item.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[formatTelefone(item.telefone), formatDocumento(item.cpf_cnpj), item.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span className="shrink-0 text-right text-xs text-muted-foreground">
                  <span className="block">{Number(item.total_veiculos)} veículo(s)</span>
                  <span className="block">{Number(item.total_checklists)} checklist(s)</span>
                </span>
              </div>
            ))}
            {pageItems.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</p>
            )}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="cliente(s)" />
        </>
      )}

      <Dialog open={cadastrarAberto} onOpenChange={setCadastrarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar cliente</DialogTitle>
          </DialogHeader>
          <ClienteForm
            onCriado={() => {
              setCadastrarAberto(false);
              refetch();
            }}
            onCancelar={() => setCadastrarAberto(false)}
          />
        </DialogContent>
      </Dialog>

      <ClienteDetalheSheet
        clienteId={clienteDetalheId}
        onOpenChange={(open) => {
          if (!open) setClienteDetalheId(null);
        }}
      />
    </div>
  );
}
