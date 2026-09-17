import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';

const FORMA_PAGAMENTO_OPTIONS = [
  { value: 'a_vista', label: 'A vista' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'consorcio', label: 'Consorcio' },
  { value: 'troca', label: 'Troca' },
];

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

const STATUS_BADGE_CLASS = {
  rascunho: 'bg-slate-100 text-slate-700',
  enviada: 'bg-sky-100 text-sky-700',
  aceita: 'bg-emerald-100 text-emerald-700',
  recusada: 'bg-red-100 text-red-700',
};

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const emptyForm = {
  lead_id: '',
  veiculo_estoque_id: '',
  veiculo_descricao: '',
  valor_veiculo: '',
  desconto_valor: '',
  forma_pagamento: 'a_vista',
  valor_entrada: '',
  vendedor_id: '',
  validade_ate: '',
  observacoes: '',
};

const emptyVendaForm = {
  veiculo_estoque_id: '',
  valor_final: '',
  forma_pagamento: 'a_vista',
  desconto_valor: '',
  vendedor_id: '',
  motivo_status_id: '',
  data_venda: new Date().toISOString().slice(0, 10),
  observacoes: '',
};

export default function Propostas() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [leadSearch, setLeadSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);

  const [acceptTarget, setAcceptTarget] = useState(null);
  const [vendaForm, setVendaForm] = useState(emptyVendaForm);

  const { data: propostas = [], isLoading, error } = useQuery({
    queryKey: ['crm-propostas'],
    queryFn: () => crmDataClient.entities.Proposta.list('-created_date'),
  });

  const { data: leadOptions = [] } = useQuery({
    queryKey: ['crm-propostas-lead-search', leadSearch],
    queryFn: () => crmDataClient.entities.Lead.list('-created_date', 10),
    enabled: createOpen,
  });

  const filteredLeadOptions = useMemo(() => {
    const term = leadSearch.trim().toLowerCase();
    if (!term) return leadOptions.slice(0, 10);
    return leadOptions.filter((lead) => (
      lead.nome.toLowerCase().includes(term) || lead.telefone.includes(term)
    )).slice(0, 10);
  }, [leadOptions, leadSearch]);

  const { data: veiculos = [] } = useQuery({
    queryKey: ['crm-veiculos-estoque'],
    queryFn: () => crmDataClient.entities.VeiculoEstoque.list('-created_date'),
  });

  const veiculosDisponiveis = useMemo(
    () => veiculos.filter((veiculo) => ['disponivel', 'reservado'].includes(veiculo.status)),
    [veiculos],
  );

  const { data: modelos = [] } = useQuery({
    queryKey: ['crm-modelos-veiculo'],
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
  });

  const { data: marcas = [] } = useQuery({
    queryKey: ['crm-marcas-veiculo'],
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
  });

  const modeloPorId = useMemo(() => Object.fromEntries(modelos.map((modelo) => [modelo.id, modelo])), [modelos]);
  const marcaNomePorId = useMemo(() => Object.fromEntries(marcas.map((marca) => [marca.id, marca.nome])), [marcas]);

  const veiculoLabel = (veiculoId) => {
    const veiculo = veiculos.find((item) => item.id === veiculoId);
    if (!veiculo) return '-';
    const modelo = modeloPorId[veiculo.modelo_id];
    const marca = modelo ? marcaNomePorId[modelo.marca_id] : '';
    return [marca, modelo?.nome, veiculo.chassi].filter(Boolean).join(' ');
  };

  const { data: responsaveis = [] } = useQuery({
    queryKey: ['crm-responsaveis'],
    queryFn: () => crmDataClient.entities.Responsavel.list(),
  });

  const { data: motivosStatus = [] } = useQuery({
    queryKey: ['crm-motivos-status'],
    queryFn: () => crmDataClient.entities.MotivoStatus.list('nome'),
  });

  const motivosConvertido = useMemo(
    () => motivosStatus.filter((motivo) => motivo.status === 'convertido' && motivo.ativo),
    [motivosStatus],
  );

  const valorFinalPreview = useMemo(() => {
    const valor = Number(form.valor_veiculo || 0);
    const desconto = Number(form.desconto_valor || 0);
    return Math.max(valor - desconto, 0);
  }, [form.valor_veiculo, form.desconto_valor]);

  const createMutation = useMutation({
    mutationFn: (data) => crmDataClient.entities.Proposta.create(data),
    onMutate: () => {
      setCreateOpen(false);
      setForm(emptyForm);
      setSelectedLead(null);
      setLeadSearch('');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      toast({ title: 'Proposta criada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel criar a proposta',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const recusarMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Proposta.recusar(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      toast({ title: 'Proposta recusada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel recusar a proposta',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const enviarMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Proposta.marcarEnviada(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      toast({ title: 'Proposta marcada como enviada', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel atualizar a proposta',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const acceptMutation = useMutation({
    mutationFn: ({ id, vendaData }) => crmDataClient.entities.Proposta.aceitar(id, vendaData),
    onMutate: () => {
      setAcceptTarget(null);
      setVendaForm(emptyVendaForm);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      await queryClient.invalidateQueries({ queryKey: ['crm-veiculos-estoque'] });
      toast({ title: 'Venda fechada com sucesso', variant: 'success' });
    },
    onError: (mutationError) => toast({
      title: 'Nao foi possivel fechar a venda',
      description: mutationError.message,
      variant: 'destructive',
    }),
  });

  const handleSelectLead = (lead) => {
    setSelectedLead(lead);
    setForm((prev) => ({ ...prev, lead_id: lead.id, vendedor_id: prev.vendedor_id || lead.responsavel_id || '' }));
    setLeadSearch(lead.nome);
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!form.lead_id) {
      toast({ title: 'Selecione um lead', variant: 'destructive' });
      return;
    }
    createMutation.mutate(form);
  };

  const openAcceptDialog = (proposta) => {
    setAcceptTarget(proposta);
    setVendaForm({
      ...emptyVendaForm,
      veiculo_estoque_id: proposta.veiculo_estoque_id || '',
      valor_final: proposta.valor_final || '',
      forma_pagamento: proposta.forma_pagamento || 'a_vista',
      desconto_valor: proposta.desconto_valor || '',
      vendedor_id: proposta.vendedor_id || '',
      motivo_status_id: motivosConvertido[0]?.id || '',
    });
  };

  const handleAccept = (event) => {
    event.preventDefault();
    if (!acceptTarget) return;
    acceptMutation.mutate({ id: acceptTarget.id, vendaData: vendaForm });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <div className="mb-5 flex items-center justify-between border-b pb-5">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest">Propostas</h1>
          <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
            Orcamentos formais vinculados a um lead. Aceitar uma proposta fecha a venda:
            baixa o veiculo do estoque e converte o lead automaticamente.
          </p>
        </div>
        <Button
          type="button"
          className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" /> Nova proposta
        </Button>
      </div>

      {isLoading ? <p className="py-10 text-sm text-muted-foreground">Carregando propostas...</p> : null}
      {error ? <p className="py-10 text-sm text-red-600">{error.message}</p> : null}
      {!isLoading && !error && propostas.length === 0 ? (
        <p className="py-10 text-sm text-muted-foreground">Nenhuma proposta cadastrada.</p>
      ) : null}

      {!isLoading && !error && propostas.length > 0 ? (
        <div className="overflow-x-auto border bg-white">
          <Table>
            <TableHeader className="bg-[#1a1a1a]">
              <TableRow>
                <TableHead className="text-white">Veiculo</TableHead>
                <TableHead className="text-white">Valor final</TableHead>
                <TableHead className="text-white">Pagamento</TableHead>
                <TableHead className="text-white">Status</TableHead>
                <TableHead className="text-white">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {propostas.map((proposta) => (
                <TableRow key={proposta.id}>
                  <TableCell className="text-sm text-slate-700">
                    {proposta.veiculo_estoque_id ? veiculoLabel(proposta.veiculo_estoque_id) : (proposta.veiculo_descricao || '-')}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700">{formatCurrency(proposta.valor_final)}</TableCell>
                  <TableCell className="text-sm text-slate-700">
                    {FORMA_PAGAMENTO_OPTIONS.find((option) => option.value === proposta.forma_pagamento)?.label || '-'}
                  </TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE_CLASS[proposta.status]}`}>
                      {STATUS_LABEL[proposta.status] || proposta.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {proposta.status === 'rascunho' ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-none text-xs"
                          onClick={() => enviarMutation.mutate(proposta.id)}
                        >
                          Marcar enviada
                        </Button>
                      ) : null}
                      {['rascunho', 'enviada'].includes(proposta.status) ? (
                        <>
                          <Button
                            type="button"
                            className="h-8 rounded-none text-xs"
                            onClick={() => openAcceptDialog(proposta)}
                          >
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aceitar e fechar venda
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-none text-xs text-red-600"
                            onClick={() => recusarMutation.mutate(proposta.id)}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Recusar
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={createOpen} onOpenChange={(open) => {
        setCreateOpen(open);
        if (!open) {
          setForm(emptyForm);
          setSelectedLead(null);
          setLeadSearch('');
        }
      }}
      >
        <DialogContent className="rounded-none sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova proposta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Lead</Label>
              <Input
                value={leadSearch}
                onChange={(event) => { setLeadSearch(event.target.value); setSelectedLead(null); setForm((prev) => ({ ...prev, lead_id: '' })); }}
                placeholder="Buscar por nome ou telefone"
                className="h-9 rounded-none"
              />
              {!selectedLead && leadSearch.trim() && filteredLeadOptions.length > 0 ? (
                <div className="max-h-40 overflow-y-auto border bg-white">
                  {filteredLeadOptions.map((lead) => (
                    <button
                      type="button"
                      key={lead.id}
                      onClick={() => handleSelectLead(lead)}
                      className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-red-50"
                    >
                      {lead.nome} <span className="text-xs text-muted-foreground">{lead.telefone}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {selectedLead ? (
                <p className="text-xs text-muted-foreground">Lead selecionado: <span className="font-bold">{selectedLead.nome}</span></p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Veiculo do estoque</Label>
              <Select
                value={form.veiculo_estoque_id}
                onValueChange={(value) => setForm((prev) => ({ ...prev, veiculo_estoque_id: value, veiculo_descricao: '' }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione (ou descreva abaixo)" /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {veiculosDisponiveis.map((veiculo) => (
                    <SelectItem key={veiculo.id} value={veiculo.id}>{veiculoLabel(veiculo.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!form.veiculo_estoque_id ? (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Ou descreva o veiculo</Label>
                <Input
                  value={form.veiculo_descricao}
                  onChange={(event) => setForm((prev) => ({ ...prev, veiculo_descricao: event.target.value }))}
                  placeholder="Ex.: Civic 2024 0km (ainda fora do estoque)"
                  className="h-9 rounded-none"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Valor do veiculo</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.valor_veiculo}
                  onChange={(event) => setForm((prev) => ({ ...prev, valor_veiculo: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Desconto</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.desconto_valor}
                  onChange={(event) => setForm((prev) => ({ ...prev, desconto_valor: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Valor final: <span className="font-bold">{formatCurrency(valorFinalPreview)}</span></p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Forma de pagamento</Label>
                <Select value={form.forma_pagamento} onValueChange={(value) => setForm((prev) => ({ ...prev, forma_pagamento: value }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {FORMA_PAGAMENTO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Entrada</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.valor_entrada}
                  onChange={(event) => setForm((prev) => ({ ...prev, valor_entrada: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Vendedor responsavel</Label>
                <Select value={form.vendedor_id} onValueChange={(value) => setForm((prev) => ({ ...prev, vendedor_id: value }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {responsaveis.map((responsavel) => (
                      <SelectItem key={responsavel.id} value={responsavel.id}>{responsavel.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Validade ate</Label>
                <Input
                  type="date"
                  value={form.validade_ate}
                  onChange={(event) => setForm((prev) => ({ ...prev, validade_ate: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Observacoes</Label>
              <Textarea
                value={form.observacoes}
                onChange={(event) => setForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                className="rounded-none"
              />
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={!form.lead_id || !form.valor_veiculo || createMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar proposta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(acceptTarget)} onOpenChange={(open) => { if (!open) { setAcceptTarget(null); setVendaForm(emptyVendaForm); } }}>
        <DialogContent className="rounded-none sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fechar venda</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAccept} className="space-y-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Veiculo do estoque</Label>
              <Select
                value={vendaForm.veiculo_estoque_id}
                onValueChange={(value) => setVendaForm((prev) => ({ ...prev, veiculo_estoque_id: value }))}
              >
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione o veiculo vendido" /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {veiculosDisponiveis.map((veiculo) => (
                    <SelectItem key={veiculo.id} value={veiculo.id}>{veiculoLabel(veiculo.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Valor final</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={vendaForm.valor_final}
                  onChange={(event) => setVendaForm((prev) => ({ ...prev, valor_final: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Desconto</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={vendaForm.desconto_valor}
                  onChange={(event) => setVendaForm((prev) => ({ ...prev, desconto_valor: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Forma de pagamento</Label>
                <Select value={vendaForm.forma_pagamento} onValueChange={(value) => setVendaForm((prev) => ({ ...prev, forma_pagamento: value }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {FORMA_PAGAMENTO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Data da venda</Label>
                <Input
                  type="date"
                  value={vendaForm.data_venda}
                  onChange={(event) => setVendaForm((prev) => ({ ...prev, data_venda: event.target.value }))}
                  className="h-9 rounded-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Vendedor</Label>
                <Select value={vendaForm.vendedor_id} onValueChange={(value) => setVendaForm((prev) => ({ ...prev, vendedor_id: value }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {responsaveis.map((responsavel) => (
                      <SelectItem key={responsavel.id} value={responsavel.id}>{responsavel.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Motivo de conversao</Label>
                <Select value={vendaForm.motivo_status_id} onValueChange={(value) => setVendaForm((prev) => ({ ...prev, motivo_status_id: value }))}>
                  <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent className="rounded-none">
                    {motivosConvertido.map((motivo) => (
                      <SelectItem key={motivo.id} value={motivo.id}>{motivo.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Observacoes</Label>
              <Textarea
                value={vendaForm.observacoes}
                onChange={(event) => setVendaForm((prev) => ({ ...prev, observacoes: event.target.value }))}
                className="rounded-none"
              />
            </div>

            <DialogFooter>
              <Button
                type="submit"
                disabled={!vendaForm.veiculo_estoque_id || !vendaForm.valor_final || !vendaForm.motivo_status_id || acceptMutation.isPending}
                className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
              >
                {acceptMutation.isPending ? 'Fechando venda...' : 'Confirmar venda'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
