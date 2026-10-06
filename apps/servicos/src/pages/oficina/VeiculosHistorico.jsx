import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Handshake, Plus, Trash2 } from 'lucide-react';

import { oficinaApi } from '@macom/api-client/oficinaApi';
import { Badge, Button, CarLoader, Dialog, DialogContent, DialogHeader, DialogTitle, useToast } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';
import ClienteVeiculoPicker, { VeiculoForm } from '@/components/oficina/ClienteVeiculoPicker';
import VeiculoDetalheSheet from '@/components/oficina/VeiculoDetalheSheet';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';

export default function VeiculosHistorico() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [veiculoDetalheId, setVeiculoDetalheId] = useState(null);
  const [veiculoTransferir, setVeiculoTransferir] = useState(null);
  const [novoCliente, setNovoCliente] = useState(null);
  const [transferindo, setTransferindo] = useState(false);
  const [erroTransferencia, setErroTransferencia] = useState(null);
  const [veiculoExcluir, setVeiculoExcluir] = useState(null);

  const queryKey = ['oficina', 'veiculos'];

  const {
    data: veiculos = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: () => oficinaApi.veiculos.listar(''),
  });

  const filtrados = useMemo(() => {
    if (!busca.trim()) return veiculos;
    const termo = busca.trim().toLowerCase();
    return veiculos.filter((item) =>
      [item.placa, item.chassi, item.modelo_nome, item.marca_nome, item.cliente_atual_nome]
        .filter(Boolean)
        .some((campo) => campo.toLowerCase().includes(termo)),
    );
  }, [veiculos, busca]);

  const { page, setPage, pageItems, total, pageSize } = usePagination(filtrados, 15);

  const handleTransferir = async () => {
    if (!veiculoTransferir || !novoCliente) return;
    setTransferindo(true);
    setErroTransferencia(null);
    try {
      await oficinaApi.veiculos.transferir({ veiculoId: veiculoTransferir.id, clienteId: novoCliente.id });
      setVeiculoTransferir(null);
      setNovoCliente(null);
      refetch();
    } catch (error) {
      setErroTransferencia(error.message || 'Não foi possível transferir o veículo.');
    } finally {
      setTransferindo(false);
    }
  };

  const handleExcluir = (event) => {
    // otimista: fecha o diálogo e remove da lista na hora, sem esperar o servidor.
    // Veículo pode ter proposta/venda vinculada no CRM (FK), então em erro a linha
    // volta para a lista e o usuário vê o motivo num toast.
    event?.preventDefault();
    if (!veiculoExcluir) return;
    const alvo = veiculoExcluir;
    setVeiculoExcluir(null);
    const anterior = queryClient.getQueryData(queryKey);
    queryClient.setQueryData(queryKey, (old = []) => old.filter((item) => item.id !== alvo.id));
    oficinaApi.veiculos
      .excluir(alvo.id)
      .catch((error) => {
        queryClient.setQueryData(queryKey, anterior);
        toast({
          title: 'Não foi possível excluir o veículo',
          description: error.message || 'Tente novamente.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        queryClient.invalidateQueries({ queryKey });
      });
  };

  const descricaoExcluir = veiculoExcluir
    ? [veiculoExcluir.marca_nome, veiculoExcluir.modelo_nome, veiculoExcluir.placa || veiculoExcluir.chassi]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">Veículos cadastrados</h1>
          <p className="text-sm text-muted-foreground">Todos os veículos já cadastrados na base.</p>
        </div>
        {user?.isOficinaInspetor && (
          <Button onClick={() => setCadastrarAberto(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Cadastrar veículo
          </Button>
        )}
      </div>

      <SearchInput
        value={busca}
        onChange={setBusca}
        placeholder="Buscar por placa, chassi, modelo ou cliente..."
        className="md:max-w-sm"
      />

      {isLoading && <CarLoader inline />}

      {isError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          Não foi possível carregar os veículos.
        </p>
      )}

      {!isLoading && !isError && (
        <>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
            {pageItems.map((item) => (
              <div
                key={item.id}
                className="flex cursor-pointer items-center gap-3 p-3 hover:bg-muted/50"
                onClick={() => setVeiculoDetalheId(item.id)}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Car className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {[item.marca_nome, item.modelo_nome].filter(Boolean).join(' ') || '—'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.placa, item.chassi, item.cor].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Dono atual: {item.cliente_atual_nome || '—'}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {item.total_checklists > 0
                    ? `${item.total_checklists} checklist${item.total_checklists > 1 ? 's' : ''}`
                    : 'Sem checklists'}
                </span>
                {item.eh_teste && <Badge variant="outline">Teste</Badge>}
                {item.tem_proposta_venda && (
                  <span className="shrink-0" title="Veículo com proposta/venda no CRM">
                    <Handshake className="h-4 w-4 text-amber-500" aria-label="Veículo com proposta/venda no CRM" />
                  </span>
                )}
                {user?.isOficinaInspetor && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setVeiculoTransferir(item);
                    }}
                  >
                    Transferir
                  </Button>
                )}
                {user?.isOficinaAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10"
                    disabled={item.tem_proposta_venda}
                    title={
                      item.tem_proposta_venda
                        ? 'Veículo com proposta/venda no CRM não pode ser excluído'
                        : 'Excluir veículo'
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      setVeiculoExcluir(item);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {pageItems.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhum veículo encontrado.</p>
            )}
          </div>

          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="veículo(s)" />
        </>
      )}

      <Dialog open={cadastrarAberto} onOpenChange={setCadastrarAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cadastrar veículo</DialogTitle>
          </DialogHeader>
          <VeiculoForm
            onCriado={() => {
              setCadastrarAberto(false);
              refetch();
            }}
            onCancelar={() => setCadastrarAberto(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(veiculoTransferir)}
        onOpenChange={(open) => {
          if (!open) {
            setVeiculoTransferir(null);
            setNovoCliente(null);
            setErroTransferencia(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Transferir veículo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Dono atual: {veiculoTransferir?.cliente_atual_nome || '—'}. Selecione o novo cliente.
          </p>
          <ClienteVeiculoPicker tipo="cliente" label="Novo cliente" value={novoCliente} onChange={setNovoCliente} />
          {erroTransferencia && <p className="text-xs text-destructive">{erroTransferencia}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setVeiculoTransferir(null)} disabled={transferindo}>
              Cancelar
            </Button>
            <Button type="button" onClick={handleTransferir} disabled={!novoCliente || transferindo}>
              {transferindo ? 'Transferindo...' : 'Confirmar transferência'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(veiculoExcluir)}
        onOpenChange={(open) => !open && setVeiculoExcluir(null)}
        onConfirm={handleExcluir}
        title="Excluir veículo"
        description={`Excluir definitivamente o veículo "${descricaoExcluir}"? Isso apaga o veículo, seus checklists e o registro no estoque do CRM. Não pode ser desfeito.`}
      />

      <VeiculoDetalheSheet
        veiculoId={veiculoDetalheId}
        onOpenChange={(open) => {
          if (!open) setVeiculoDetalheId(null);
        }}
      />
    </div>
  );
}
