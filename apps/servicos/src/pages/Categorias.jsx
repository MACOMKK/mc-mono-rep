import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  Badge,
  Button,
  Input,
  MoneyLoader,
  Spinner,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  useToast,
} from '@macom/ui';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';
import { normalize } from '@/lib/normalize';

function formatData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

const categoriasKey = ['servicos', 'categorias', 'admin'];

function invalidateCategoriasCatalogo(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['servicos', 'categorias'], exact: true });
  queryClient.invalidateQueries({ queryKey: ['servicos', 'catalogos-solicitacao'] });
}

export default function Categorias() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [novoNome, setNovoNome] = useState('');
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busca, setBusca] = useState('');

  const categoriasQuery = useQuery({
    queryKey: categoriasKey,
    queryFn: () => financeiroApi.categorias.listAdmin(),
  });
  const rows = categoriasQuery.data || [];
  const loading = categoriasQuery.isLoading;
  const filteredRows = rows.filter((row) => !busca.trim() || normalize(row.nome).includes(normalize(busca)));
  const { page, setPage, pageItems, total } = usePagination(filteredRows, 10);

  const criarMutation = useMutation({
    mutationFn: ({ nome }) => financeiroApi.categorias.criar(nome),
    onMutate: ({ nome, tempId }) => {
      const previous = queryClient.getQueryData(categoriasKey);
      const optimisticRow = { id: tempId, nome, ativo: true, criado_em: new Date().toISOString(), total_solicitacoes: 0 };
      queryClient.setQueryData(categoriasKey, (old) => [...(old || []), optimisticRow]);
      setNovoNome('');
      return { previous, tempId };
    },
    onSuccess: (row, _variables, context) => {
      queryClient.setQueryData(categoriasKey, (old) =>
        (old || []).map((item) => (item.id === context.tempId ? { ...item, ...row } : item)),
      );
      invalidateCategoriasCatalogo(queryClient);
      toast({ title: 'Categoria cadastrada' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(categoriasKey, context.previous);
      toast({ title: 'Não foi possível cadastrar a categoria', description: error.message });
    },
  });

  const atualizarMutation = useMutation({
    mutationFn: ({ id, nome, ativo }) => financeiroApi.categorias.atualizar(id, { nome, ativo }),
    onMutate: ({ id, nome, ativo }) => {
      const previous = queryClient.getQueryData(categoriasKey);
      queryClient.setQueryData(categoriasKey, (old) =>
        (old || []).map((item) => (item.id === id ? { ...item, nome, ativo } : item)),
      );
      cancelEdit();
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(categoriasKey, (old) =>
        (old || []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      invalidateCategoriasCatalogo(queryClient);
      toast({ title: 'Categoria atualizada' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(categoriasKey, context.previous);
      toast({ title: 'Não foi possível atualizar a categoria', description: error.message });
    },
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: ({ id, nome, ativo }) => financeiroApi.categorias.atualizar(id, { nome, ativo }),
    onMutate: ({ id, ativo }) => {
      const previous = queryClient.getQueryData(categoriasKey);
      queryClient.setQueryData(categoriasKey, (old) =>
        (old || []).map((item) => (item.id === id ? { ...item, ativo } : item)),
      );
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(categoriasKey, (old) =>
        (old || []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      invalidateCategoriasCatalogo(queryClient);
      toast({ title: updated.ativo ? 'Categoria reativada' : 'Categoria inativada' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(categoriasKey, context.previous);
      toast({ title: 'Não foi possível atualizar a categoria', description: error.message });
    },
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => financeiroApi.categorias.deletar(id),
    onMutate: (id) => {
      const previous = queryClient.getQueryData(categoriasKey);
      queryClient.setQueryData(categoriasKey, (old) => (old || []).filter((item) => item.id !== id));
      setDeleteTarget(null);
      return { previous };
    },
    onSuccess: () => {
      invalidateCategoriasCatalogo(queryClient);
      toast({ title: 'Categoria excluída' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(categoriasKey, context.previous);
      toast({ title: 'Não foi possível excluir a categoria', description: error.message });
    },
  });

  function handleCriar(event) {
    event.preventDefault();
    const nome = novoNome.trim();
    if (!nome || criarMutation.isPending) return;
    criarMutation.mutate({ nome, tempId: `optimistic-${crypto.randomUUID()}` });
  }

  function startEdit(row) {
    setEditId(row.id);
    setEditNome(row.nome);
  }

  function cancelEdit() {
    setEditId(null);
    setEditNome('');
  }

  function handleSalvarNome(row) {
    const nome = editNome.trim();
    if (!nome) return;
    atualizarMutation.mutate({ id: row.id, nome, ativo: row.ativo });
  }

  function handleToggleAtivo(row) {
    toggleAtivoMutation.mutate({ id: row.id, nome: row.nome, ativo: !row.ativo });
  }

  function handleDeletar() {
    if (!deleteTarget) return;
    deletarMutation.mutate(deleteTarget.id);
  }

  const isSaving = (id) => atualizarMutation.variables?.id === id && atualizarMutation.isPending
    || toggleAtivoMutation.variables?.id === id && toggleAtivoMutation.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Categorias</h2>
        <p className="text-sm text-muted-foreground">
          Categorias de despesa usadas nas solicitações de pagamento.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar..." className="max-w-sm" />

        <form onSubmit={handleCriar} className="flex items-end gap-2">
          <Input
            id="novaCategoria"
            value={novoNome}
            onChange={(event) => setNovoNome(event.target.value)}
            placeholder="Nome da categoria"
            className="w-48"
          />
          <Button type="submit" disabled={criarMutation.isPending || !novoNome.trim()}>
            {criarMutation.isPending ? <Spinner size="sm" className="mr-1" /> : <Plus className="mr-1 h-4 w-4" />}
            Cadastrar
          </Button>
        </form>
      </div>

      {loading ? (
        <MoneyLoader inline />
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? 'Nenhuma categoria cadastrada.' : 'Nenhuma categoria corresponde à pesquisa.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-xs">
                    {editId === row.id ? (
                      <Input
                        autoFocus
                        value={editNome}
                        onChange={(event) => setEditNome(event.target.value)}
                        disabled={isSaving(row.id)}
                      />
                    ) : (
                      <span className="font-medium">{row.nome}</span>
                    )}
                  </TableCell>
                  <TableCell>{formatData(row.criado_em)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.ativo}
                        disabled={isSaving(row.id)}
                        onCheckedChange={() => handleToggleAtivo(row)}
                      />
                      <Badge variant={row.ativo ? 'default' : 'secondary'}>
                        {row.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {editId === row.id ? (
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={cancelEdit} disabled={isSaving(row.id)}>
                          Cancelar
                        </Button>
                        <Button size="sm" onClick={() => handleSalvarNome(row)} disabled={isSaving(row.id)}>
                          {isSaving(row.id) ? <Spinner size="sm" /> : 'Salvar'}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" aria-label="Editar nome" onClick={() => startEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={row.total_solicitacoes > 0}
                                  onClick={() => setDeleteTarget(row)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {row.total_solicitacoes > 0
                                ? `Usada em ${row.total_solicitacoes} solicitação(ões) — não pode ser excluída, apenas inativada.`
                                : 'Excluir categoria'}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {filteredRows.length > 0 && (
        <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} itemLabel="categoria(s)" />
      )}

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeletar}
        isLoading={deletarMutation.isPending}
        title="Excluir categoria"
        description={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Essa ação não pode ser desfeita. Só é possível excluir categorias que nunca foram usadas em nenhuma solicitação.`}
      />
    </div>
  );
}
