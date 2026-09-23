import { useEffect, useMemo, useState } from 'react';
import { crmDataClient } from '@/api/crmDataClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useEmpresa } from '@/context/EmpresaContext';
import { useUnidadesEmpresa } from '@/hooks/useUnidadesEmpresa';
import { cn } from '@/lib/utils';
import ListPagination from '@/components/ListPagination';
import { Building2, Car, Clock3, History, Mail, Paperclip, Pencil, Phone, Save, Search, Tag, UserRound, X } from 'lucide-react';

import { ACTIVE_LEAD_STATUSES as ACTIVE_LEAD_STATUSES_LIST, LEAD_STATUS_LABEL, LEAD_STATUS_STYLE } from '@/lib/leadStatus';

const STATUS_LABEL = {
  lead: 'Lead',
  cliente: 'Cliente',
  pos_venda: 'Pos-venda',
};

const STATUS_STYLE = {
  lead: 'border-blue-200 bg-blue-50 text-blue-700',
  cliente: 'border-green-200 bg-green-50 text-green-700',
  pos_venda: 'border-amber-200 bg-amber-50 text-amber-700',
};

const ACTIVE_LEAD_STATUSES = new Set(ACTIVE_LEAD_STATUSES_LIST);

const ATTENDANCE_RESULT_LABEL = {
  contato_realizado: 'Contato realizado',
  sem_resposta: 'Sem resposta',
  visita_agendada: 'Visita agendada',
  test_drive: 'Test-drive',
  proposta_enviada: 'Proposta enviada',
  venda_realizada: 'Venda realizada',
  lead_perdido: 'Lead perdido',
};

const FORMA_PAGAMENTO_LABEL = {
  a_vista: 'A vista',
  financiamento: 'Financiamento',
  consorcio: 'Consorcio',
  troca: 'Troca',
};

function formatCurrency(value) {
  const number = Number(value || 0);
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dateOnlyAsLocal(value) {
  if (!value) return null;
  return `${String(value).slice(0, 10)}T00:00:00`;
}

function sortTimeline(items) {
  const seen = new Set();
  return items
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .filter((item) => {
      const key = `${item.type}-${item.date}-${item.title}-${item.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export default function Clientes() {
  const [busca, setBusca] = useState('');
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState(null);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const { empresa } = useEmpresa();
  const { empresas: EMPRESAS } = useUnidadesEmpresa();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const clienteFilters = useMemo(() => ({
    ...(empresa !== 'Todas' ? { empresa } : {}),
    ...(periodoInicio ? { created_from: `${periodoInicio}T00:00:00` } : {}),
    ...(periodoFim ? { created_to: `${periodoFim}T23:59:59.999` } : {}),
  }), [empresa, periodoFim, periodoInicio]);

  const clientesQueryKey = ['clientes', { filters: clienteFilters, busca, page, pageSize }];

  useEffect(() => {
    setPage(1);
  }, [busca, empresa, periodoFim, periodoInicio]);

  const { data: clientesPage = { rows: [], count: 0, page: 1, pageSize }, isFetching } = useQuery({
    queryKey: clientesQueryKey,
    queryFn: () => crmDataClient.entities.Cliente.listPage({
      orderBy: '-updated_date',
      page,
      limit: pageSize,
      filters: clienteFilters,
      search: busca,
    }),
  });
  const clientes = clientesPage.rows;
  const totalPages = Math.max(1, Math.ceil((clientesPage.count || 0) / pageSize));

  const filtrados = clientes;
  const selectedId = selected?.id || '';

  const clienteIds = useMemo(() => clientes.map((cliente) => cliente.id), [clientes]);

  const { data: activeLeadsByCliente = {} } = useQuery({
    queryKey: ['clientes-active-leads', clienteIds],
    enabled: clienteIds.length > 0,
    queryFn: async () => {
      const leadsPage = await crmDataClient.entities.Lead.listPage({
        orderBy: '-created_date',
        limit: Math.max(clienteIds.length * 3, 100),
        filters: { cliente_id: clienteIds, status: [...ACTIVE_LEAD_STATUSES] },
      });
      const map = {};
      for (const lead of leadsPage.rows || []) {
        if (!map[lead.cliente_id]) map[lead.cliente_id] = lead;
      }
      return map;
    },
  });

  const {
    data: selectedLeadsPage = { rows: [] },
    isFetching: loadingSelectedLeads,
    isError: errorSelectedLeads,
    error: selectedLeadsError,
  } = useQuery({
    queryKey: ['cliente-leads', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => crmDataClient.entities.Lead.listPage({
      orderBy: '-created_date',
      limit: 100,
      filters: { cliente_id: selectedId },
    }),
  });

  const {
    data: selectedAtendimentosPage = { rows: [] },
    isFetching: loadingSelectedAtendimentos,
    isError: errorSelectedAtendimentos,
    error: selectedAtendimentosError,
  } = useQuery({
    queryKey: ['cliente-atendimentos', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      orderBy: '-created_date',
      limit: 100,
      filters: { cliente_id: selectedId },
    }),
  });

  const {
    data: selectedHistoricoPage = { rows: [] },
    isFetching: loadingSelectedHistorico,
    isError: errorSelectedHistorico,
    error: selectedHistoricoError,
  } = useQuery({
    queryKey: ['cliente-historico', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => crmDataClient.entities.HistoricoAtendimento.listPage({
      orderBy: '-created_date',
      limit: 200,
      filters: { cliente_id: selectedId },
    }),
  });

  const {
    data: selectedVendasPage = { rows: [] },
    isFetching: loadingSelectedVendas,
    isError: errorSelectedVendas,
    error: selectedVendasError,
  } = useQuery({
    queryKey: ['cliente-vendas', selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => crmDataClient.entities.Venda.listPage({
      orderBy: '-created_date',
      limit: 100,
      filters: { cliente_id: selectedId },
    }),
  });
  const selectedVendas = selectedVendasPage.rows || [];

  const { data: veiculosEstoque = [] } = useQuery({
    queryKey: ['clientes-veiculos-estoque'],
    enabled: selectedVendas.length > 0,
    queryFn: () => crmDataClient.entities.VeiculoEstoque.list('-created_date'),
  });

  const { data: modelosVeiculo = [] } = useQuery({
    queryKey: ['clientes-modelos-veiculo'],
    enabled: selectedVendas.length > 0,
    queryFn: () => crmDataClient.entities.ModeloVeiculo.list('nome'),
  });

  const { data: marcasVeiculo = [] } = useQuery({
    queryKey: ['clientes-marcas-veiculo'],
    enabled: selectedVendas.length > 0,
    queryFn: () => crmDataClient.entities.MarcaVeiculo.list('nome'),
  });

  const modeloPorId = useMemo(() => Object.fromEntries(modelosVeiculo.map((modelo) => [modelo.id, modelo])), [modelosVeiculo]);
  const marcaNomePorId = useMemo(() => Object.fromEntries(marcasVeiculo.map((marca) => [marca.id, marca.nome])), [marcasVeiculo]);

  const veiculoVendaLabel = (veiculoId) => {
    const veiculo = veiculosEstoque.find((item) => item.id === veiculoId);
    if (!veiculo) return '-';
    const modelo = modeloPorId[veiculo.modelo_id];
    const marca = modelo ? marcaNomePorId[modelo.marca_id] : '';
    return [marca, modelo?.nome, veiculo.chassi].filter(Boolean).join(' ') || '-';
  };

  const selectedHistorico = selectedHistoricoPage.rows || [];
  const selectedLeads = selectedLeadsPage.rows || [];
  const selectedAtendimentos = selectedAtendimentosPage.rows || [];
  const loadingSelectedTimeline = loadingSelectedLeads || loadingSelectedAtendimentos || loadingSelectedHistorico;
  const errorSelectedTimeline = errorSelectedLeads || errorSelectedAtendimentos || errorSelectedHistorico;
  const selectedTimelineErrorMessage =
    selectedLeadsError?.message || selectedAtendimentosError?.message || selectedHistoricoError?.message
    || 'Nao foi possivel carregar os dados do cliente.';
  const activeLead = selectedLeads.find((lead) => ACTIVE_LEAD_STATUSES.has(lead.status));
  const selectedTimeline = useMemo(() => {
    if (!selected) return [];

    const clienteItems = [
      {
        id: `cliente-created-${selected.id}`,
        type: 'cliente',
        date: selected.created_date,
        label: 'Cliente',
        title: 'Cadastro do cliente criado',
        description: selected.nome,
        status: STATUS_LABEL[selected.status_relacionamento] || selected.status_relacionamento,
        icon: UserRound,
      },
    ];

    const leadItems = selectedLeads.flatMap((lead) => {
      const items = [
        {
          id: `lead-created-${lead.id}`,
          type: 'lead',
          date: lead.created_date,
          label: 'Lead',
          title: `Lead criado${lead.modelo_interesse ? ` - ${lead.modelo_interesse}` : ''}`,
          description: `Origem: ${lead.origem || '-'}${lead.responsavel_nome ? ` | Responsavel: ${lead.responsavel_nome}` : ''}`,
          status: LEAD_STATUS_LABEL[lead.status] || lead.status,
          icon: Tag,
        },
      ];

      if (lead.primeiro_contato_em) {
        items.push({
          id: `lead-first-contact-${lead.id}`,
          type: 'lead',
          date: lead.primeiro_contato_em,
          label: 'Lead',
          title: 'Primeiro contato registrado',
          description: lead.modelo_interesse || 'Lead em acompanhamento',
          status: 'Contato realizado',
          icon: Phone,
        });
      }

      if (lead.convertido_em) {
        items.push({
          id: `lead-converted-${lead.id}`,
          type: 'lead',
          date: lead.convertido_em,
          label: 'Conversao',
          title: 'Lead convertido em cliente',
          description: lead.modelo_interesse || 'Conversao registrada',
          status: 'Convertido',
          icon: Car,
        });
      }

      if (lead.perdido_em) {
        items.push({
          id: `lead-lost-${lead.id}`,
          type: 'lead',
          date: lead.perdido_em,
          label: 'Perda',
          title: 'Lead marcado como perdido',
          description: lead.motivo_perda || 'Motivo nao informado',
          status: 'Perdido',
          icon: X,
        });
      }

      return items;
    });

    const atividadeItems = selectedAtendimentos.flatMap((atendimento) => {
      const items = [
        {
          id: `atividade-created-${atendimento.id}`,
          type: 'atividade',
          date: atendimento.created_date,
          label: 'Atividade',
          title: atendimento.titulo || 'Atividade criada',
          description: `${atendimento.tipo_evento || 'atividade'}${atendimento.modelo_interesse ? ` | ${atendimento.modelo_interesse}` : ''}`,
          status: atendimento.status,
          icon: Clock3,
        },
      ];

      if (atendimento.proximo_contato) {
        items.push({
          id: `atividade-due-${atendimento.id}`,
          type: 'atividade',
          date: dateOnlyAsLocal(atendimento.proximo_contato),
          label: 'Agenda',
          title: 'Proximo contato planejado',
          description: atendimento.titulo || atendimento.cliente_nome || selected.nome,
          status: atendimento.status,
          icon: Clock3,
        });
      }

      if (atendimento.concluido_em) {
        items.push({
          id: `atividade-done-${atendimento.id}`,
          type: 'atividade',
          date: atendimento.concluido_em,
          label: 'Resultado',
          title: ATTENDANCE_RESULT_LABEL[atendimento.resultado] || 'Atividade concluida',
          description: atendimento.motivo_resultado || atendimento.observacoes || atendimento.titulo || '',
          status: atendimento.status,
          icon: History,
        });
      }

      return items;
    });

    const historicoItems = selectedHistorico.map((item) => {
      const isLeadNote = item.tipo === 'observacao' && item.metadados?.origem === 'lead_note';
      const isLeadAttachment = item.tipo === 'observacao' && item.metadados?.origem === 'lead_attachment';
      return {
        id: `historico-${item.id}`,
        type: isLeadAttachment ? 'anexo' : (isLeadNote ? 'nota' : 'historico'),
        date: item.created_date,
        label: isLeadAttachment ? 'Anexo' : (isLeadNote ? 'Nota' : (item.tipo || 'Historico')),
        title: isLeadAttachment ? 'Anexo vinculado ao lead' : (isLeadNote ? 'Nota vinculada ao lead' : (item.descricao || 'Registro de historico')),
        description: isLeadAttachment
          ? (item.metadados?.nome || item.descricao)
          : (isLeadNote ? item.descricao : (item.entidade ? `Entidade: ${item.entidade}` : '')),
        status: item.status,
        icon: isLeadAttachment ? Paperclip : History,
      };
    });

    return sortTimeline([
      ...clienteItems,
      ...leadItems,
      ...atividadeItems,
      ...historicoItems,
    ]);
  }, [selected, selectedAtendimentos, selectedHistorico, selectedLeads]);

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => crmDataClient.entities.Cliente.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['clientes'] });
      const previousClientes = queryClient.getQueryData(clientesQueryKey);
      const previousSelected = selected;
      const optimistic = {
        ...selected,
        ...data,
        id,
        updated_date: new Date().toISOString(),
      };

      queryClient.setQueryData(clientesQueryKey, (currentPage = clientesPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).map((cliente) => cliente.id === id ? { ...cliente, ...optimistic } : cliente),
      }));
      setSelected(optimistic);
      setFormData(optimistic);
      setEditing(false);

      return { previousClientes, previousSelected };
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(clientesQueryKey, (currentPage = clientesPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).map((cliente) => cliente.id === updated.id ? updated : cliente),
      }));
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['cliente-historico', updated.id] });
      setSelected(updated);
      setFormData(updated);
      toast({
        title: 'Cliente atualizado',
        description: 'As informacoes do cliente foram salvas.',
        variant: 'success',
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousClientes) {
        queryClient.setQueryData(clientesQueryKey, context.previousClientes);
      }
      if (context?.previousSelected) {
        setSelected(context.previousSelected);
        setFormData(context.previousSelected);
      }
      toast({
        title: 'Nao foi possivel atualizar o cliente',
        description: error.message || 'Revise os dados informados.',
        variant: 'destructive',
      });
    },
  });

  function openCliente(cliente) {
    setSelected(cliente);
    setFormData(cliente);
    setEditing(false);
  }

  function closeCliente() {
    setSelected(null);
    setFormData(null);
    setEditing(false);
  }

  function updateField(field, value) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function saveCliente(event) {
    event.preventDefault();
    updateMutation.mutate({
      id: selected.id,
      data: formData,
    });
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 md:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest">Contatos e Clientes</h1>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
            Pessoas em prospeccao, clientes convertidos e historico comercial
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar cliente..."
              className="h-9 w-64 rounded-none bg-white pl-9 text-sm"
            />
          </div>
          <Input
            type="date"
            value={periodoInicio}
            onChange={(event) => setPeriodoInicio(event.target.value)}
            className="h-9 w-40 rounded-none bg-white text-xs"
            title="Inicio do periodo de cadastro"
          />
          <Input
            type="date"
            value={periodoFim}
            onChange={(event) => setPeriodoFim(event.target.value)}
            className="h-9 w-40 rounded-none bg-white text-xs"
            title="Fim do periodo de cadastro"
          />
        </div>
      </div>

      <ListPagination
        className="mb-3"
        count={clientesPage.count}
        isFetching={isFetching}
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
      />

      <div className="overflow-x-auto bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#1a1a1a] hover:bg-[#1a1a1a]">
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-white">Cliente</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-white">Contato</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-white">Lead ativo</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-white">Unidade</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-widest text-white">Status</TableHead>
              <TableHead className="w-32 text-right text-[10px] font-bold uppercase tracking-widest text-white">Historico</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Nenhum cliente encontrado
                </TableCell>
              </TableRow>
            ) : filtrados.map((cliente, index) => {
              return (
                <TableRow
                  key={cliente.id}
                  className={cn('cursor-pointer hover:bg-red-50', index % 2 === 0 ? 'bg-white' : 'bg-[#f9f9f9]')}
                  onClick={() => openCliente(cliente)}
                >
                  <TableCell>
                    <div className="font-bold text-sm">{cliente.nome}</div>
                    <div className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">cadastro do cliente</div>
                  </TableCell>
                  <TableCell className="space-y-1 text-xs">
                    {cliente.telefone ? <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{cliente.telefone}</div> : null}
                    {cliente.email ? <div className="flex items-center gap-1"><Mail className="h-3 w-3" />{cliente.email}</div> : null}
                  </TableCell>
                  <TableCell className="text-xs">
                    {activeLeadsByCliente[cliente.id] ? (
                      <div className="space-y-1">
                        <Badge className={cn('rounded-sm border text-[10px] uppercase tracking-wider', LEAD_STATUS_STYLE[activeLeadsByCliente[cliente.id].status] || LEAD_STATUS_STYLE.novo)}>
                          {LEAD_STATUS_LABEL[activeLeadsByCliente[cliente.id].status] || activeLeadsByCliente[cliente.id].status}
                        </Badge>
                        <div className="text-[11px] text-muted-foreground">
                          {activeLeadsByCliente[cliente.id].modelo_interesse || 'Modelo nao informado'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Nenhum</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{cliente.empresa}</TableCell>
                  <TableCell>
                    <Badge className={cn('rounded-sm border text-[10px] uppercase tracking-wider', STATUS_STYLE[cliente.status_relacionamento] || STATUS_STYLE.lead)}>
                      {STATUS_LABEL[cliente.status_relacionamento] || 'Lead'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="outline" className="h-8 rounded-none text-xs font-bold uppercase tracking-wider">
                      Abrir
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && closeCliente()}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
          <SheetHeader className="bg-[#1a1a1a] px-6 py-5">
            <SheetTitle className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-white">
              <UserRound className="h-4 w-4 text-primary" />
              Historico do Cliente
            </SheetTitle>
          </SheetHeader>

          {selected ? (
            <div className="space-y-5 p-6">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-widest">{selected.nome}</h2>
                    <div className="mt-2 grid gap-2 text-sm text-muted-foreground">
                      {selected.telefone ? <span className="flex items-center gap-2"><Phone className="h-4 w-4" />{selected.telefone}</span> : null}
                      {selected.email ? <span className="flex items-center gap-2"><Mail className="h-4 w-4" />{selected.email}</span> : null}
                      <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />{selected.empresa}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant={editing ? 'outline' : 'default'}
                    className="h-9 rounded-none text-xs font-bold uppercase tracking-wider"
                    onClick={() => {
                      setEditing((current) => !current);
                      setFormData(selected);
                    }}
                  >
                    {editing ? <X className="mr-1.5 h-3.5 w-3.5" /> : <Pencil className="mr-1.5 h-3.5 w-3.5" />}
                    {editing ? 'Cancelar' : 'Editar'}
                  </Button>
                </div>
              </div>

              {editing ? (
                <form onSubmit={saveCliente} className="border-t pt-5">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Dados do cliente</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nome *</Label>
                      <Input required value={formData?.nome || ''} onChange={(event) => updateField('nome', event.target.value)} className="h-9 rounded-none text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Telefone *</Label>
                      <Input required value={formData?.telefone || ''} onChange={(event) => updateField('telefone', event.target.value)} className="h-9 rounded-none text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">E-mail</Label>
                      <Input type="email" value={formData?.email || ''} onChange={(event) => updateField('email', event.target.value)} className="h-9 rounded-none text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Unidade</Label>
                      <Select value={formData?.empresa || 'Macom Ananindeua'} onValueChange={(value) => updateField('empresa', value)}>
                        <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-none">{EMPRESAS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</Label>
                      <Select value={formData?.status_relacionamento || 'lead'} onValueChange={(value) => updateField('status_relacionamento', value)}>
                        <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent className="rounded-none">
                          <SelectItem value="lead">Lead</SelectItem>
                          <SelectItem value="cliente">Cliente</SelectItem>
                          <SelectItem value="pos_venda">Pos-venda</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Observacoes gerais</Label>
                      <Textarea value={formData?.observacoes || ''} onChange={(event) => updateField('observacoes', event.target.value)} className="resize-none rounded-none text-sm" rows={3} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <Button type="submit" disabled={updateMutation.isPending} className="h-9 rounded-none text-xs font-bold uppercase tracking-wider">
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Salvar Cliente
                    </Button>
                  </div>
                </form>
              ) : null}

              <Tabs defaultValue="visao" className="border-t pt-5">
                <TabsList className="grid h-auto w-full grid-cols-5 rounded-none bg-slate-100 p-1">
                  <TabsTrigger value="visao" className="rounded-none text-[10px] font-bold uppercase tracking-widest">Resumo</TabsTrigger>
                  <TabsTrigger value="leads" className="rounded-none text-[10px] font-bold uppercase tracking-widest">Leads</TabsTrigger>
                  <TabsTrigger value="atendimentos" className="rounded-none text-[10px] font-bold uppercase tracking-widest">Atividades</TabsTrigger>
                  <TabsTrigger value="vendas" className="rounded-none text-[10px] font-bold uppercase tracking-widest">Vendas</TabsTrigger>
                  <TabsTrigger value="historico" className="rounded-none text-[10px] font-bold uppercase tracking-widest">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="visao" className="mt-4 space-y-4">
                  {errorSelectedTimeline ? (
                    <div className="border border-dashed border-red-300 bg-red-50 py-6 text-center text-xs font-semibold uppercase tracking-widest text-red-700">
                      {selectedTimelineErrorMessage}
                    </div>
                  ) : loadingSelectedTimeline ? (
                    <div className="border border-dashed py-6 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Carregando dados do cliente...
                    </div>
                  ) : activeLead ? (
                    <div className="border-l-4 border-blue-600 bg-blue-50 p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Lead ativo</p>
                        <Badge className={cn('rounded-sm border text-[10px] uppercase tracking-wider', LEAD_STATUS_STYLE[activeLead.status] || LEAD_STATUS_STYLE.novo)}>
                          {LEAD_STATUS_LABEL[activeLead.status] || activeLead.status}
                        </Badge>
                      </div>
                      <p className="text-sm font-bold">{activeLead.modelo_interesse || 'Modelo nao informado'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Origem: {activeLead.origem || '-'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Criado em: {formatDate(activeLead.created_date)}</p>
                    </div>
                  ) : (
                    <div className="border border-dashed py-6 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nenhum lead ativo
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Leads</p>
                      <p className="mt-1 text-2xl font-black">{selectedLeads.length}</p>
                    </div>
                    <div className="bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Atividades</p>
                      <p className="mt-1 text-2xl font-black">{selectedAtendimentos.length}</p>
                    </div>
                    <div className="bg-white p-4 shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timeline</p>
                      <p className="mt-1 text-2xl font-black">{selectedTimeline.length}</p>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="leads" className="mt-4">
                  {errorSelectedLeads ? (
                    <div className="border border-dashed border-red-300 bg-red-50 py-8 text-center text-xs font-semibold uppercase tracking-widest text-red-700">
                      {selectedLeadsError?.message || 'Nao foi possivel carregar os leads.'}
                    </div>
                  ) : loadingSelectedLeads ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Carregando leads...
                    </div>
                  ) : selectedLeads.length === 0 ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nenhum lead registrado
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedLeads.map((lead) => (
                        <div key={lead.id} className="bg-white p-4 shadow-sm">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary">
                              <Tag className="h-3 w-3" />
                              Lead
                            </span>
                            <Badge className={cn('rounded-sm border text-[10px] uppercase tracking-wider', LEAD_STATUS_STYLE[lead.status] || LEAD_STATUS_STYLE.novo)}>
                              {LEAD_STATUS_LABEL[lead.status] || lead.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-bold">{lead.modelo_interesse || 'Modelo nao informado'}</p>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>Origem: {lead.origem || '-'}</span>
                            <span>Criado em: {formatDate(lead.created_date)}</span>
                            {lead.convertido_em ? <span>Convertido em: {formatDate(lead.convertido_em)}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="atendimentos" className="mt-4">
                  {errorSelectedAtendimentos ? (
                    <div className="border border-dashed border-red-300 bg-red-50 py-8 text-center text-xs font-semibold uppercase tracking-widest text-red-700">
                      {selectedAtendimentosError?.message || 'Nao foi possivel carregar as atividades.'}
                    </div>
                  ) : loadingSelectedAtendimentos ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Carregando atividades...
                    </div>
                  ) : selectedAtendimentos.length === 0 ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nenhuma atividade registrada
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedAtendimentos.map((atendimento) => (
                        <div key={atendimento.id} className="border-l-4 border-primary bg-white p-4 shadow-sm">
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-primary">{atendimento.tipo_evento || 'atividade'}</span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{atendimento.status}</span>
                          </div>
                          <p className="text-sm font-bold">{atendimento.titulo}</p>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>Origem: {atendimento.origem || '-'}</span>
                            {atendimento.resultado ? <span>Resultado: {ATTENDANCE_RESULT_LABEL[atendimento.resultado] || atendimento.resultado}</span> : null}
                            {atendimento.proximo_contato ? <span>Proximo contato: {formatDate(`${String(atendimento.proximo_contato).slice(0, 10)}T00:00:00`)}</span> : null}
                            <span>Criado em: {formatDate(atendimento.created_date)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="vendas" className="mt-4">
                  {errorSelectedVendas ? (
                    <div className="border border-dashed border-red-300 bg-red-50 py-8 text-center text-xs font-semibold uppercase tracking-widest text-red-700">
                      {selectedVendasError?.message || 'Nao foi possivel carregar as vendas.'}
                    </div>
                  ) : loadingSelectedVendas ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Carregando vendas...
                    </div>
                  ) : selectedVendas.length === 0 ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nenhuma venda registrada
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedVendas.map((venda) => (
                        <div key={venda.id} className="border-l-4 border-emerald-600 bg-white p-4 shadow-sm">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                              <Car className="h-3 w-3" />
                              Venda
                            </span>
                            <span className="text-sm font-bold">{formatCurrency(venda.valor_final)}</span>
                          </div>
                          <p className="text-sm font-bold">{veiculoVendaLabel(venda.veiculo_estoque_id)}</p>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>Forma de pagamento: {FORMA_PAGAMENTO_LABEL[venda.forma_pagamento] || venda.forma_pagamento}</span>
                            <span>Data da venda: {venda.data_venda ? formatDate(venda.data_venda) : '-'}</span>
                            {venda.observacoes ? <span>Observacoes: {venda.observacoes}</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="historico" className="mt-4">
                  {errorSelectedTimeline ? (
                    <div className="border border-dashed border-red-300 bg-red-50 py-8 text-center text-xs font-semibold uppercase tracking-widest text-red-700">
                      {selectedTimelineErrorMessage}
                    </div>
                  ) : loadingSelectedTimeline ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Carregando timeline...
                    </div>
                  ) : selectedTimeline.length === 0 ? (
                    <div className="border border-dashed py-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Nenhum movimento registrado
                    </div>
                  ) : (
                    <div className="relative space-y-0 pl-5 before:absolute before:left-2 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
                      {selectedTimeline.map((item) => {
                        const Icon = item.icon || History;
                        return (
                          <div key={item.id} className="relative pb-4 last:pb-0">
                            <span className="absolute -left-[18px] top-4 flex h-5 w-5 items-center justify-center rounded-full border border-primary bg-white text-primary">
                              <Icon className="h-3 w-3" />
                            </span>
                            <div className="bg-white p-4 shadow-sm">
                              <div className="mb-1 flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                                  {item.label}
                                </span>
                                <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  <Clock3 className="h-3 w-3" />
                                  {formatDate(item.date)}
                                </span>
                              </div>
                              <p className="text-sm font-semibold">{item.title}</p>
                              {item.description ? (
                                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                              ) : null}
                              {item.status ? (
                                <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                                  Status: {item.status}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
