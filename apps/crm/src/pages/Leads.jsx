import { useEffect, useMemo, useState } from 'react';
import { crmDataClient } from '@/api/crmDataClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, LayoutGrid, List, Search, RotateCcw } from 'lucide-react';
import LeadForm from '@/components/leads/LeadForm';
import MotivoStatusSelect from '@/components/leads/MotivoStatusSelect';
import LeadViewer from '@/components/leads/LeadViewer';
import LeadsKanban from '@/components/leads/LeadsKanban';
import ListPagination from '@/components/ListPagination';
import { useEmpresa } from '@/context/EmpresaContext';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import { LEAD_STATUS_BADGE as STATUS_STYLES, LEAD_STATUS_LABEL as STATUS_LABEL, LEAD_STATUS_REQUIREMENTS } from '@/lib/leadStatus';

const FUNIL_STATUSES = ['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao', 'convertido', 'perdido'];

const SLA_STYLES = {
  atrasado: 'bg-red-100 text-red-700',
  alerta: 'bg-amber-100 text-amber-700',
  no_prazo: 'bg-blue-100 text-blue-700',
  concluido: 'bg-green-100 text-green-700',
};

const SLA_LABELS = {
  atrasado: '1o contato atrasado',
  alerta: '1o contato perto',
  no_prazo: '1o contato no prazo',
  concluido: '1o contato realizado',
};

const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${value}T00:00:00`))
  : '-';

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '-';

const getClosingStatus = (lead) => {
  if (!lead.previsao_fechamento) {
    return { label: '-', className: 'text-muted-foreground' };
  }
  if (['convertido', 'perdido'].includes(lead.status)) {
    return { label: formatDate(lead.previsao_fechamento), className: 'text-muted-foreground' };
  }

  const dueDate = new Date(`${String(lead.previsao_fechamento).slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);

  if (Number.isNaN(dueDate.getTime())) {
    return { label: '-', className: 'text-muted-foreground' };
  }

  if (diffDays < 0) {
    return { label: `${formatDate(lead.previsao_fechamento)} - vencida`, className: 'text-red-700 font-bold' };
  }
  if (diffDays === 0) {
    return { label: `${formatDate(lead.previsao_fechamento)} - hoje`, className: 'text-amber-700 font-bold' };
  }
  return { label: formatDate(lead.previsao_fechamento), className: 'text-muted-foreground' };
};

const createTempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const formatVehicleLabel = (vehicle = {}, fallback = '') => {
  const label = [
    vehicle.marca,
    vehicle.modelo,
    vehicle.versao,
    vehicle.ano,
  ].filter(Boolean).join(' ');
  return label || fallback;
};

export default function Leads() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingLead, setViewingLead] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null); // { lead, status }
  const [statusMotivoId, setStatusMotivoId] = useState('');
  const [statusExtraValues, setStatusExtraValues] = useState({});
  const [statusFiltro, setStatusFiltro] = useState('todos');
  const [viewMode, setViewMode] = useState('kanban');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [responsavelFiltro, setResponsavelFiltro] = useState('todos');
  const [origemFiltro, setOrigemFiltro] = useState('todas');
  const [slaFiltro, setSlaFiltro] = useState('todos');
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filters = useMemo(() => ({
    ...(empresa !== 'Todas' ? { empresa } : {}),
    status: statusFiltro !== 'todos' ? statusFiltro : FUNIL_STATUSES,
    ...(responsavelFiltro !== 'todos' && responsavelFiltro !== 'sem_responsavel' ? { responsavel_id: responsavelFiltro } : {}),
    ...(responsavelFiltro === 'sem_responsavel' ? { responsavel_id: '__NULL__' } : {}),
    ...(origemFiltro !== 'todas' ? { origem_id: origemFiltro } : {}),
    ...(slaFiltro !== 'todos' ? { sla_status: slaFiltro } : {}),
    ...(periodoInicio ? { created_from: `${periodoInicio}T00:00:00` } : {}),
    ...(periodoFim ? { created_to: `${periodoFim}T23:59:59.999` } : {}),
  }), [empresa, origemFiltro, periodoFim, periodoInicio, responsavelFiltro, slaFiltro, statusFiltro]);

  const leadsQueryKey = ['leads', { filters, busca: buscaDebounced, page, pageSize }];

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBuscaDebounced(busca.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [busca]);

  useEffect(() => {
    setPage(1);
  }, [buscaDebounced, empresa, origemFiltro, periodoFim, periodoInicio, responsavelFiltro, slaFiltro, statusFiltro]);

  const { data: leadsPage = { rows: [], count: 0, page: 1, pageSize }, isFetching, isError, error: leadsError } = useQuery({
    queryKey: leadsQueryKey,
    queryFn: () => crmDataClient.entities.Lead.listPage({
      orderBy: '-created_date',
      page,
      limit: pageSize,
      filters,
      search: buscaDebounced,
    }),
  });
  const leads = leadsPage.rows;
  const totalPages = Math.max(1, Math.ceil((leadsPage.count || 0) / pageSize));

  const kanbanAtivo = viewMode === 'kanban';
  const { data: atividadesPlanejadas = [] } = useQuery({
    queryKey: ['atividade-planejadas-kanban', { empresa }],
    enabled: kanbanAtivo,
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      limit: 500,
      filters: { ...(empresa !== 'Todas' ? { empresa } : {}), status: 'planejada' },
    }).then((result) => result.rows || []),
  });
  const leadsComAtividadePendente = useMemo(
    () => new Set(atividadesPlanejadas.map((atividade) => atividade.lead_id).filter(Boolean)),
    [atividadesPlanejadas]
  );

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? crmDataClient.entities.Lead.update(id, data)
      : crmDataClient.entities.Lead.create(data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData(leadsQueryKey);
      const now = new Date().toISOString();
      const tempId = createTempId();
      const selectedResponsavel = responsaveis.find((item) => item.id === data.responsavel_id) || null;
      const optimisticData = {
        ...data,
        modelo_interesse: formatVehicleLabel(data.veiculo_interesse, data.modelo_interesse),
        responsavel: selectedResponsavel,
        responsavel_nome: selectedResponsavel?.nome || '',
      };

      queryClient.setQueryData(leadsQueryKey, (currentPage = leadsPage) => {
        const current = currentPage.rows || [];
        const nextRows = id
          ? current.map((lead) => (
              lead.id === id
                ? { ...lead, ...optimisticData, updated_date: now }
                : lead
            ))
          : [
              {
                id: tempId,
                created_date: now,
                updated_date: now,
                status: 'novo',
                empresa: data.empresa || 'Macom Ananindeua',
                ...optimisticData,
              },
              ...current,
            ];

        return {
          ...currentPage,
          rows: nextRows,
          count: id ? currentPage.count : (currentPage.count || 0) + 1,
        };
      });

      return { previousLeads, tempId, id };
    },
    onSuccess: (saved, variables, context) => {
      setFormOpen(false);
      setEditing(null);
      const selectedResponsavel = responsaveis.find((item) => item.id === variables.data.responsavel_id) || null;
      const hydratedSaved = saved
        ? {
            ...saved,
            responsavel: selectedResponsavel || saved.responsavel,
            responsavel_nome: selectedResponsavel?.nome || saved.responsavel_nome || '',
          }
        : saved;
      queryClient.setQueryData(leadsQueryKey, (currentPage = leadsPage) => {
        const current = currentPage.rows || [];
        if (!hydratedSaved) return currentPage;
        const rows = context?.tempId
          ? current.map((lead) => lead.id === context.tempId ? hydratedSaved : lead)
          : current.map((lead) => lead.id === hydratedSaved.id ? hydratedSaved : lead);

        return { ...currentPage, rows };
      });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: ['lead-historico', saved.id] });
      }
      toast({
        title: context?.id ? 'Lead atualizado' : 'Lead criado',
        description: context?.id
          ? 'As informacoes do lead foram salvas.'
          : 'O lead foi cadastrado na central.',
        variant: 'success',
      });
    },
    onError: (error, _data, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey, context.previousLeads);
      }
      toast({
        title: 'Nao foi possivel salvar o lead',
        description: error.message || 'Revise os dados informados.',
        variant: 'destructive',
      });
    },
  });

  const autoSaveMutation = useMutation({
    mutationFn: ({ id, data }) => crmDataClient.entities.Lead.update(id, data),
    onSuccess: (saved) => {
      if (!saved) return;
      queryClient.setQueryData(leadsQueryKey, (currentPage = leadsPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).map((lead) => (lead.id === saved.id ? saved : lead)),
      }));
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel salvar automaticamente',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ['crm-responsaveis'],
    queryFn: () => crmDataClient.entities.Responsavel.list(),
  });

  const { data: origensLead = [] } = useQuery({
    queryKey: ['crm-origens-lead'],
    queryFn: () => crmDataClient.entities.OrigemLead.list('nome'),
  });

  const { data: motivosStatus = [] } = useQuery({
    queryKey: ['crm-motivos-status'],
    queryFn: () => crmDataClient.entities.MotivoStatus.list('nome'),
  });

  const editingId = editing?.id || '';
  const { data: historicoPage = { rows: [] } } = useQuery({
    queryKey: ['lead-historico', editingId],
    enabled: Boolean(editingId),
    queryFn: () => crmDataClient.entities.HistoricoAtendimento.listPage({
      orderBy: '-created_date',
      limit: 200,
      filters: { lead_id: editingId },
    }),
  });
  const historico = historicoPage.rows || [];

  const getLeadHistoricoQueryKey = (leadId = editingId) => ['lead-historico', leadId || editingId];

  const updateHistoricoCache = (queryKey, updater) => {
    queryClient.setQueryData(queryKey, (current = { rows: [], count: 0 }) => {
      const rows = Array.isArray(current) ? current : (current.rows || []);
      const nextRows = updater(rows);

      if (Array.isArray(current)) {
        return nextRows;
      }

      return {
        ...current,
        rows: nextRows,
        count: nextRows.length,
      };
    });
  };

  const replaceHistoricoItem = (queryKey, tempId, saved) => {
    if (!saved) return;
    updateHistoricoCache(queryKey, (rows) => rows.map((item) => item.id === tempId ? saved : item));
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, ...extra }) => crmDataClient.entities.Lead.update(id, { status, ...extra }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData(leadsQueryKey);

      queryClient.setQueryData(leadsQueryKey, (currentPage = leadsPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).map((lead) => lead.id === id ? { ...lead, status } : lead),
      }));

      return { previousLeads };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', editingId] });
      setStatusTarget(null);
      setStatusMotivoId('');
      setStatusExtraValues({});
    },
    onError: (error, _variables, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey, context.previousLeads);
      }

      toast({
        title: 'Nao foi possivel atualizar o lead',
        description: error.message || 'Revise os dados informados.',
        variant: 'destructive',
      });
    },
  });

  const noteMutation = useMutation({
    mutationFn: ({ lead, text }) => crmDataClient.entities.HistoricoAtendimento.create({
      cliente_id: lead.cliente_id,
      lead_id: lead.id,
      tipo: 'observacao',
      descricao: text,
      entidade: 'Lead',
      entidade_id: lead.id,
      status: lead.status,
      metadados: { origem: 'lead_note' },
    }),
    onMutate: async ({ lead, text }) => {
      const queryKey = getLeadHistoricoQueryKey(lead.id);
      await queryClient.cancelQueries({ queryKey });
      const previousHistorico = queryClient.getQueryData(queryKey);
      const tempId = createTempId();

      updateHistoricoCache(queryKey, (rows) => [
        {
          id: tempId,
          cliente_id: lead.cliente_id,
          lead_id: lead.id,
          tipo: 'observacao',
          descricao: text,
          entidade: 'Lead',
          entidade_id: lead.id,
          status: lead.status,
          metadados: { origem: 'lead_note', pendente: true },
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
        ...rows,
      ]);

      return { previousHistorico, queryKey, tempId };
    },
    onSuccess: (saved, _variables, context) => {
      if (context?.queryKey && context?.tempId) {
        replaceHistoricoItem(context.queryKey, context.tempId, saved);
      }
      queryClient.invalidateQueries({ queryKey: context?.queryKey || getLeadHistoricoQueryKey() });
      toast({
        title: 'Nota registrada',
        description: 'A nota foi vinculada ao lead.',
        variant: 'success',
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousHistorico) {
        queryClient.setQueryData(context.queryKey, context.previousHistorico);
      }
      toast({
        title: 'Nao foi possivel registrar a nota',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const attachmentMutation = useMutation({
    mutationFn: ({ lead, file }) => crmDataClient.entities.HistoricoAtendimento.uploadLeadAttachment({ lead, file }),
    onMutate: async ({ lead, file }) => {
      const queryKey = getLeadHistoricoQueryKey(lead.id);
      await queryClient.cancelQueries({ queryKey });
      const previousHistorico = queryClient.getQueryData(queryKey);
      const tempId = createTempId();

      updateHistoricoCache(queryKey, (rows) => [
        {
          id: tempId,
          cliente_id: lead.cliente_id,
          lead_id: lead.id,
          tipo: 'observacao',
          descricao: file.name,
          entidade: 'Lead',
          entidade_id: lead.id,
          status: lead.status,
          metadados: {
            origem: 'lead_attachment',
            nome: file.name,
            tipo: file.type,
            tamanho: file.size,
            pendente: true,
          },
          created_date: new Date().toISOString(),
          updated_date: new Date().toISOString(),
        },
        ...rows,
      ]);

      return { previousHistorico, queryKey, tempId };
    },
    onSuccess: (saved, _variables, context) => {
      if (context?.queryKey && context?.tempId) {
        replaceHistoricoItem(context.queryKey, context.tempId, saved);
      }
      queryClient.invalidateQueries({ queryKey: context?.queryKey || getLeadHistoricoQueryKey() });
      toast({
        title: 'Anexo registrado',
        description: 'O arquivo foi vinculado ao lead.',
        variant: 'success',
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousHistorico) {
        queryClient.setQueryData(context.queryKey, context.previousHistorico);
      }
      toast({
        title: 'Nao foi possivel anexar o arquivo',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const openAttachment = async (attachment) => {
    try {
      await crmDataClient.entities.HistoricoAtendimento.openAttachment(attachment);
    } catch (error) {
      toast({
        title: 'Nao foi possivel abrir o anexo',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachment) => crmDataClient.entities.HistoricoAtendimento.deleteAttachment(attachment),
    onMutate: async (attachment) => {
      const queryKey = getLeadHistoricoQueryKey(attachment.lead_id);
      await queryClient.cancelQueries({ queryKey });
      const previousHistorico = queryClient.getQueryData(queryKey);

      updateHistoricoCache(queryKey, (rows) => rows.filter((item) => item.id !== attachment.id));

      return { previousHistorico, queryKey };
    },
    onSuccess: (_result, _attachment, context) => {
      queryClient.invalidateQueries({ queryKey: context?.queryKey || getLeadHistoricoQueryKey() });
      toast({
        title: 'Anexo excluido',
        description: 'O arquivo foi removido do lead.',
        variant: 'success',
      });
    },
    onError: (error, _attachment, context) => {
      if (context?.previousHistorico) {
        queryClient.setQueryData(context.queryKey, context.previousHistorico);
      }
      toast({
        title: 'Nao foi possivel excluir o anexo',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const deleteAttachment = (attachment) => {
    const fileName = attachment.metadados?.nome || attachment.descricao || 'este anexo';
    const confirmed = window.confirm(`Excluir ${fileName}?`);
    if (!confirmed) return;
    deleteAttachmentMutation.mutate(attachment);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const novoStatus = destination.droppableId;
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead || lead.status === novoStatus) return;

    if (LEAD_STATUS_REQUIREMENTS[novoStatus]) {
      setStatusTarget({ lead, status: novoStatus });
      setStatusMotivoId('');
      setStatusExtraValues({
        previsao_fechamento: lead.previsao_fechamento || '',
      });
      return;
    }

    updateStatusMutation.mutate({ id: draggableId, status: novoStatus });
  };

  const filtrados = leads;

  const clearFilters = () => {
    setBusca('');
    setResponsavelFiltro('todos');
    setOrigemFiltro('todas');
    setSlaFiltro('todos');
    setStatusFiltro('todos');
    setPeriodoInicio('');
    setPeriodoFim('');
  };

  const counts = leads.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status] || 0) + 1 }), {});
  const editingNotes = editing
    ? historico.filter((item) => item.lead_id === editing.id && item.tipo === 'observacao' && item.metadados?.origem === 'lead_note')
    : [];
  const editingAttachments = editing
    ? historico.filter((item) => item.lead_id === editing.id && item.metadados?.origem === 'lead_attachment')
    : [];

  const STATUS_TABS = ['todos', 'novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao', 'convertido', 'perdido'];

  return (
    <div className={cn(
      'max-w-[1400px] mx-auto px-4 md:px-6',
      viewMode === 'kanban' ? 'pt-5 h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden' : 'py-5'
    )}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest">Central de Leads</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">
            Funil comercial de captacao e conversao
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border bg-white">
            <button
              onClick={() => setViewMode('kanban')}
              className={cn('p-2 transition-colors', viewMode === 'kanban' ? 'bg-[#1a1a1a] text-white' : 'text-muted-foreground hover:text-foreground')}
              title="Kanban"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn('p-2 transition-colors', viewMode === 'table' ? 'bg-[#1a1a1a] text-white' : 'text-muted-foreground hover:text-foreground')}
              title="Tabela"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <Button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="h-9 text-xs font-bold uppercase tracking-widest rounded-none px-5 bg-primary hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo Lead
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="mb-4 border border-dashed border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-red-700">
          {leadsError?.message || 'Nao foi possivel carregar os leads.'}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2 border border-border bg-white p-3 shadow-sm">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar nome, telefone, e-mail ou veiculo..."
            className="h-9 rounded-none pl-9 text-sm"
          />
        </div>
        <Select value={responsavelFiltro} onValueChange={setResponsavelFiltro}>
          <SelectTrigger className="h-9 w-48 rounded-none text-xs"><SelectValue placeholder="Responsavel" /></SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="todos">Todos os responsaveis</SelectItem>
            <SelectItem value="sem_responsavel">Sem responsavel</SelectItem>
            {responsaveis.map((responsavel) => (
              <SelectItem key={responsavel.id} value={responsavel.id}>{responsavel.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={origemFiltro} onValueChange={setOrigemFiltro}>
          <SelectTrigger className="h-9 w-40 rounded-none text-xs"><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="todas">Todas as origens</SelectItem>
            {origensLead.map((origem) => (
              <SelectItem key={origem.id} value={origem.id}>{origem.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={slaFiltro} onValueChange={setSlaFiltro}>
          <SelectTrigger className="h-9 w-40 rounded-none text-xs"><SelectValue placeholder="SLA" /></SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="todos">Todos os SLAs</SelectItem>
            <SelectItem value="atrasado">1o contato atrasado</SelectItem>
            <SelectItem value="alerta">1o contato perto</SelectItem>
            <SelectItem value="no_prazo">1o contato no prazo</SelectItem>
            <SelectItem value="concluido">1o contato realizado</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={periodoInicio}
          onChange={(event) => setPeriodoInicio(event.target.value)}
          className="h-9 w-40 rounded-none text-xs"
          title="Inicio do periodo de cadastro"
        />
        <Input
          type="date"
          value={periodoFim}
          onChange={(event) => setPeriodoFim(event.target.value)}
          className="h-9 w-40 rounded-none text-xs"
          title="Fim do periodo de cadastro"
        />
        <Button type="button" variant="outline" size="icon" onClick={clearFilters} title="Limpar filtros" className="h-9 w-9 rounded-none">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="flex-1 min-h-0">
          <LeadsKanban
            leads={filtrados}
            onDragEnd={handleDragEnd}
            onCardClick={(lead) => setViewingLead(lead)}
            leadsComAtividadePendente={leadsComAtividadePendente}
          />
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          <div className="flex gap-0 border-b border-border bg-white shadow-sm mb-4 overflow-x-auto">
            {STATUS_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFiltro(s)}
                className={cn(
                  'px-4 py-2.5 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 -mb-px transition-all',
                  statusFiltro === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'todos' ? 'Todos' : STATUS_LABEL[s]}
                <span className={cn('ml-1.5 text-[10px] px-1.5 py-0.5 rounded-sm font-semibold', statusFiltro === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
                  {s === 'todos' ? leads.length : (counts[s] || 0)}
                </span>
              </button>
            ))}
          </div>
          <div className="bg-white shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#1a1a1a] hover:bg-[#1a1a1a]">
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Nome</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Telefone</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Origem</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Modelo</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Empresa</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Responsavel</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">SLA 1o contato</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Previsao</TableHead>
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground py-10">
                      Nenhum lead encontrado
                    </TableCell>
                  </TableRow>
                ) : filtrados.map((lead, i) => {
                  const closingStatus = getClosingStatus(lead);
                  return (
                    <TableRow
                      key={lead.id}
                      className={cn('cursor-pointer hover:bg-red-50 transition-colors', i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9f9]')}
                      onClick={() => setViewingLead(lead)}
                    >
                      <TableCell className="font-bold text-sm">{lead.nome}</TableCell>
                      <TableCell className="text-sm">{lead.telefone}</TableCell>
                      <TableCell className="text-xs font-semibold uppercase">{lead.origem}</TableCell>
                      <TableCell className="text-sm">{lead.modelo_interesse}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.empresa}</TableCell>
                      <TableCell className="text-xs font-semibold">{lead.responsavel_nome || 'Automatico'}</TableCell>
                      <TableCell>
                        <span className={cn('px-2 py-1 text-[10px] font-bold uppercase tracking-wider', SLA_STYLES[lead.sla_status])}>
                          {SLA_LABELS[lead.sla_status] || '-'}
                        </span>
                      </TableCell>
                      <TableCell className={cn('text-xs', closingStatus.className)}>{closingStatus.label}</TableCell>
                      <TableCell>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm', STATUS_STYLES[lead.status])}>
                          {STATUS_LABEL[lead.status]}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ListPagination
            className="mt-3"
            count={leadsPage.count}
            isFetching={isFetching}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          />
        </>
      )}

      <LeadViewer
        open={Boolean(viewingLead)}
        onOpenChange={(next) => { if (!next) setViewingLead(null); }}
        lead={viewingLead}
        onEdit={() => {
          setEditing(viewingLead);
          setViewingLead(null);
          setFormOpen(true);
        }}
      />

      {formOpen && (
        <LeadForm
          key={editing?.id || 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          lead={editing}
          responsaveis={responsaveis}
          onSave={(data) => saveMutation.mutate({ id: editing?.id || null, data })}
          onAutoSave={(data) => editing?.id && autoSaveMutation.mutate({ id: editing.id, data })}
          notes={editingNotes}
          attachments={editingAttachments}
          addingNote={noteMutation.isPending}
          uploadingAttachment={attachmentMutation.isPending}
          deletingAttachment={deleteAttachmentMutation.isPending}
          onAddNote={(text) => editing && noteMutation.mutate({ lead: editing, text })}
          onAddAttachment={(file) => editing && attachmentMutation.mutate({ lead: editing, file })}
          onOpenAttachment={openAttachment}
          onDeleteAttachment={deleteAttachment}
        />
      )}

      {(() => {
        const requirement = statusTarget ? LEAD_STATUS_REQUIREMENTS[statusTarget.status] : null;
        const closeDialog = () => {
          setStatusTarget(null);
          setStatusMotivoId('');
          setStatusExtraValues({});
        };
        const canSubmit = statusTarget && requirement && (
          (!requirement.motivo || statusMotivoId)
          && requirement.fields.every((field) => String(statusExtraValues[field] || '').trim())
        );

        return (
          <Dialog open={Boolean(statusTarget)} onOpenChange={(next) => { if (!next) closeDialog(); }}>
            <DialogContent className="max-w-md rounded-none p-0">
              <DialogHeader className={cn('px-6 py-4', statusTarget?.status === 'perdido' ? 'bg-red-700' : 'bg-[#1a1a1a]')}>
                <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                  Mover lead para {statusTarget ? STATUS_LABEL[statusTarget.status] : ''}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!statusTarget || !canSubmit) return;
                  updateStatusMutation.mutate({
                    id: statusTarget.lead.id,
                    status: statusTarget.status,
                    ...(requirement.motivo ? { motivo_status_id: statusMotivoId } : {}),
                    ...Object.fromEntries(requirement.fields.map((field) => [field, statusExtraValues[field]])),
                  });
                }}
                className="flex flex-col gap-4 p-6"
              >
                <p className="text-xs text-muted-foreground">
                  Informe os dados abaixo para mover <strong>{statusTarget?.lead?.nome}</strong> para {statusTarget ? STATUS_LABEL[statusTarget.status] : ''}.
                </p>

                {requirement?.motivo && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Motivo</label>
                    <MotivoStatusSelect
                      status={statusTarget?.status}
                      value={statusMotivoId}
                      onChange={setStatusMotivoId}
                      motivosStatus={motivosStatus}
                    />
                  </div>
                )}

                {requirement?.fields.includes('previsao_fechamento') && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Previsao de fechamento</label>
                    <Input
                      type="date"
                      required
                      value={statusExtraValues.previsao_fechamento || ''}
                      onChange={(event) => setStatusExtraValues((prev) => ({ ...prev, previsao_fechamento: event.target.value }))}
                      className="rounded-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={!canSubmit || updateStatusMutation.isPending} className="rounded-none text-xs font-bold uppercase tracking-wider">
                    {updateStatusMutation.isPending ? 'Salvando...' : 'Confirmar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
