import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Pencil, Plus, Trash2 } from 'lucide-react';

import { financeiroApi } from '@macom/api-client/financeiroApi';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
import CopyButton from '@/components/CopyButton';
import Pagination from '@/components/Pagination';
import SearchInput from '@/components/SearchInput';
import { usePagination } from '@/hooks/usePagination';
import {
  FORNECEDOR_FORM_VAZIO,
  formatCep,
  formatDocumento,
  formatTelefone,
  onlyLetters,
} from '@/lib/financeiroFormat';
import { normalize } from '@/lib/normalize';

function formatData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

const fornecedoresKey = ['servicos', 'fornecedores', 'admin'];
const FORM_VAZIO = FORNECEDOR_FORM_VAZIO;

function formFromRow(row) {
  return {
    ...FORM_VAZIO,
    ...Object.fromEntries(Object.keys(FORM_VAZIO).map((key) => [key, row?.[key] ?? ''])),
  };
}

function ViewField({ label, value, className = '', copyable = false }) {
  const { toast } = useToast();
  const [copiado, setCopiado] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch (error) {
      toast({ title: 'Não foi possível copiar', description: error.message });
    }
  }

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center gap-1">
        <p className="text-sm">{value || '-'}</p>
        {copyable && value && (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            title="Copiar"
          >
            {copiado ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

function invalidateFornecedoresCatalogo(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['servicos', 'fornecedores'], exact: true });
  queryClient.invalidateQueries({ queryKey: ['servicos', 'catalogos-solicitacao'] });
}

export default function Fornecedores() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busca, setBusca] = useState('');
  const [viewRow, setViewRow] = useState(null);

  const fornecedoresQuery = useQuery({
    queryKey: fornecedoresKey,
    queryFn: () => financeiroApi.fornecedores.listAdmin(),
  });
  const rows = fornecedoresQuery.data || [];
  const loading = fornecedoresQuery.isLoading;
  const filteredRows = rows.filter(
    (row) =>
      !busca.trim() ||
      normalize(row.nome).includes(normalize(busca)) ||
      normalize(row.documento || '').includes(normalize(busca)),
  );
  const { page, setPage, pageItems, total } = usePagination(filteredRows, 10);

  const criarMutation = useMutation({
    mutationFn: (dados) => financeiroApi.fornecedores.criar(dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fornecedoresKey });
      invalidateFornecedoresCatalogo(queryClient);
      toast({ title: 'Fornecedor cadastrado' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Não foi possível cadastrar o fornecedor', description: error.message });
    },
  });

  const atualizarMutation = useMutation({
    mutationFn: ({ id, dados }) => financeiroApi.fornecedores.atualizar(id, dados),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: fornecedoresKey });
      invalidateFornecedoresCatalogo(queryClient);
      toast({ title: 'Fornecedor atualizado' });
      closeDialog();
    },
    onError: (error) => {
      toast({ title: 'Não foi possível atualizar o fornecedor', description: error.message });
    },
  });

  const toggleAtivoMutation = useMutation({
    mutationFn: ({ row, ativo }) => financeiroApi.fornecedores.atualizar(row.id, { ...formFromRow(row), ativo }),
    onMutate: ({ row, ativo }) => {
      const previous = queryClient.getQueryData(fornecedoresKey);
      queryClient.setQueryData(fornecedoresKey, (old) =>
        (old || []).map((item) => (item.id === row.id ? { ...item, ativo } : item)),
      );
      return { previous };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(fornecedoresKey, (old) =>
        (old || []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      invalidateFornecedoresCatalogo(queryClient);
      toast({ title: updated.ativo ? 'Fornecedor reativado' : 'Fornecedor inativado' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(fornecedoresKey, context.previous);
      toast({ title: 'Não foi possível atualizar o fornecedor', description: error.message });
    },
  });

  const deletarMutation = useMutation({
    mutationFn: (id) => financeiroApi.fornecedores.deletar(id),
    onMutate: (id) => {
      const previous = queryClient.getQueryData(fornecedoresKey);
      queryClient.setQueryData(fornecedoresKey, (old) => (old || []).filter((item) => item.id !== id));
      setDeleteTarget(null);
      return { previous };
    },
    onSuccess: () => {
      invalidateFornecedoresCatalogo(queryClient);
      toast({ title: 'Fornecedor excluído' });
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(fornecedoresKey, context.previous);
      toast({ title: 'Não foi possível excluir o fornecedor', description: error.message });
    },
  });

  function openNovo() {
    setEditRow(null);
    setForm(FORM_VAZIO);
    setDialogOpen(true);
  }

  function openEdit(row) {
    setViewRow(null);
    setEditRow(row);
    setForm(formFromRow(row));
    setDialogOpen(true);
  }

  function openView(row) {
    setViewRow(row);
  }

  function closeView() {
    setViewRow(null);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditRow(null);
    setForm(FORM_VAZIO);
  }

  function updateForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const nome = form.nome.trim();
    if (!nome) return;
    if (editRow) {
      atualizarMutation.mutate({ id: editRow.id, dados: { ...form, nome, ativo: editRow.ativo } });
    } else {
      criarMutation.mutate({ ...form, nome });
    }
  }

  function handleToggleAtivo(row) {
    toggleAtivoMutation.mutate({ row, ativo: !row.ativo });
  }

  function handleDeletar() {
    if (!deleteTarget) return;
    deletarMutation.mutate(deleteTarget.id);
  }

  const isSaving = criarMutation.isPending || atualizarMutation.isPending;
  const isTogglingAtivo = (id) => toggleAtivoMutation.variables?.row?.id === id && toggleAtivoMutation.isPending;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Fornecedores</h2>
        <p className="text-sm text-muted-foreground">
          Fornecedores usados nas solicitações de pagamento.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <SearchInput value={busca} onChange={setBusca} placeholder="Buscar por nome ou documento..." className="max-w-sm" />

        <Button onClick={openNovo}>
          <Plus className="mr-1 h-4 w-4" />
          Cadastrar fornecedor
        </Button>
      </div>

      {loading ? (
        <MoneyLoader inline />
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? 'Nenhum fornecedor cadastrado.' : 'Nenhum fornecedor corresponde à pesquisa.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Cadastrado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((row) => (
                <TableRow key={row.id} className="cursor-pointer" onClick={() => openView(row)}>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-1">
                      <span className="font-medium">{row.nome}</span>
                      <CopyButton value={row.nome} label="Copiar nome" />
                    </div>
                  </TableCell>
                  <TableCell>{row.documento ? formatDocumento(row.documento) : '-'}</TableCell>
                  <TableCell>{formatData(row.criado_em)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={row.ativo}
                        disabled={isTogglingAtivo(row.id)}
                        onCheckedChange={() => handleToggleAtivo(row)}
                      />
                      <Badge variant={row.ativo ? 'default' : 'secondary'}>
                        {row.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" aria-label="Editar fornecedor" onClick={() => openEdit(row)}>
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
                              ? `Usado em ${row.total_solicitacoes} solicitação(ões) — não pode ser excluído, apenas inativado.`
                              : 'Excluir fornecedor'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {filteredRows.length > 0 && (
        <Pagination page={page} pageSize={10} total={total} onPageChange={setPage} itemLabel="fornecedor(es)" />
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editRow ? 'Editar fornecedor' : 'Cadastrar fornecedor'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" maxLength={120} value={form.nome} onChange={(e) => updateForm('nome', e.target.value)} required />
              </div>

              <div className="space-y-1">
                <Label htmlFor="tipo_pessoa">Tipo de pessoa</Label>
                <select
                  id="tipo_pessoa"
                  value={form.tipo_pessoa}
                  onChange={(e) => updateForm('tipo_pessoa', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Não informado</option>
                  <option value="fisica">Pessoa física</option>
                  <option value="juridica">Pessoa jurídica</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="documento">CPF/CNPJ</Label>
                <Input
                  id="documento"
                  inputMode="numeric"
                  value={form.documento}
                  onChange={(e) => updateForm('documento', formatDocumento(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="inscricao_estadual">Inscrição estadual</Label>
                <Input
                  id="inscricao_estadual"
                  maxLength={20}
                  value={form.inscricao_estadual}
                  onChange={(e) => updateForm('inscricao_estadual', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateForm('email', e.target.value.trim().toLowerCase())}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  inputMode="numeric"
                  value={form.telefone}
                  onChange={(e) => updateForm('telefone', formatTelefone(e.target.value))}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="endereco">Endereço</Label>
                <Input id="endereco" maxLength={150} value={form.endereco} onChange={(e) => updateForm('endereco', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cidade">Cidade</Label>
                <Input id="cidade" maxLength={80} value={form.cidade} onChange={(e) => updateForm('cidade', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="uf">UF</Label>
                  <Input id="uf" maxLength={2} value={form.uf} onChange={(e) => updateForm('uf', onlyLetters(e.target.value).toUpperCase())} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cep">CEP</Label>
                  <Input id="cep" inputMode="numeric" value={form.cep} onChange={(e) => updateForm('cep', formatCep(e.target.value))} />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSaving || !form.nome.trim()}>
                {isSaving ? <Spinner size="sm" className="mr-1" /> : null}
                {editRow ? 'Salvar' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewRow)} onOpenChange={(open) => !open && closeView()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1">
              <span>{viewRow?.nome}</span>
              <CopyButton value={viewRow?.nome} label="Copiar nome" />
            </DialogTitle>
          </DialogHeader>

          {viewRow ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={viewRow.ativo ? 'default' : 'secondary'}>{viewRow.ativo ? 'Ativo' : 'Inativo'}</Badge>
                <span className="text-xs text-muted-foreground">Cadastrado em {formatData(viewRow.criado_em)}</span>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                <ViewField label="Tipo de pessoa" value={viewRow.tipo_pessoa === 'juridica' ? 'Pessoa jurídica' : viewRow.tipo_pessoa === 'fisica' ? 'Pessoa física' : null} />
                <ViewField label="CPF/CNPJ" value={viewRow.documento ? formatDocumento(viewRow.documento) : null} copyable />
                <ViewField label="Inscrição estadual" value={viewRow.inscricao_estadual} copyable />
                <ViewField label="E-mail" value={viewRow.email} copyable />
                <ViewField label="Telefone" value={viewRow.telefone ? formatTelefone(viewRow.telefone) : null} copyable />
                <ViewField label="Endereço" value={viewRow.endereco} className="sm:col-span-2" />
                <ViewField label="Cidade" value={viewRow.cidade} />
                <ViewField label="UF" value={viewRow.uf} />
                <ViewField label="CEP" value={viewRow.cep ? formatCep(viewRow.cep) : null} copyable />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeView}>
              Fechar
            </Button>
            <Button type="button" onClick={() => openEdit(viewRow)}>
              <Pencil className="mr-1 h-4 w-4" />
              Editar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDeletar}
        isLoading={deletarMutation.isPending}
        title="Excluir fornecedor"
        description={`Tem certeza que deseja excluir "${deleteTarget?.nome}"? Essa ação não pode ser desfeita. Só é possível excluir fornecedores que nunca foram usados em nenhuma solicitação.`}
      />
    </div>
  );
}
