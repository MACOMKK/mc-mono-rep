import { useEffect, useMemo, useState } from 'react';
import { crmDataClient } from '@/api/crmDataClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlarmClock, Plus, Search } from 'lucide-react';
import StatusTabs from '@/components/eventos/StatusTabs';
import EventoCard from '@/components/eventos/EventoCard';
import EventoForm from '@/components/eventos/EventoForm';
import ListPagination from '@/components/ListPagination';
import { useEmpresa } from '@/context/EmpresaContext';
import { startOfToday } from 'date-fns';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

const createTempId = () => `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
import { ACTIVE_LEAD_STATUSES } from '@/lib/leadStatus';
const STATUS_TABS = ['planejada', 'concluida', 'cancelada'];

const formatDateOnly = (date) => date.toISOString().slice(0, 10);

const getAgendaScopeDates = (scope) => {
  const today = startOfToday();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (scope === 'atrasados') return { proximo_to: formatDateOnly(yesterday) };
  if (scope === 'hoje') return { proximo_from: formatDateOnly(today), proximo_to: formatDateOnly(today) };
  if (scope === 'futuros') return { proximo_from: formatDateOnly(tomorrow) };
  return {};
};

async function countAtividades(filters, search) {
  const result = await crmDataClient.entities.Atividade.listPage({
    limit: 1,
    filters,
    search,
  });
  return result.count || 0;
}

export default function Eventos() {
  const [statusTab, setStatusTab] = useState('planejada');
  const [busca, setBusca] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [periodoInicio, setPeriodoInicio] = useState('');
  const [periodoFim, setPeriodoFim] = useState('');
  const [responsavelFiltro, setResponsavelFiltro] = useState('todos');
  const [agendaFiltro, setAgendaFiltro] = useState('todos');
  const { empresa } = useEmpresa();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const baseFilters = useMemo(() => ({
    ...(empresa !== 'Todas' ? { empresa } : {}),
  }), [empresa]);
  const resumoFilters = useMemo(() => ({
    ...baseFilters,
    ...(responsavelFiltro !== 'todos' ? { responsavel_id: responsavelFiltro } : {}),
    ...(periodoInicio ? { proximo_from: periodoInicio } : {}),
    ...(periodoFim ? { proximo_to: periodoFim } : {}),
  }), [baseFilters, periodoFim, periodoInicio, responsavelFiltro]);
  const agendaScopeFilters = useMemo(() => (
    agendaFiltro === 'todos' ? {} : getAgendaScopeDates(agendaFiltro)
  ), [agendaFiltro]);
  const eventosFilters = useMemo(() => ({
    ...resumoFilters,
    ...agendaScopeFilters,
    status: statusTab,
  }), [agendaScopeFilters, resumoFilters, statusTab]);
  const eventosQueryKey = ['eventos', { filters: eventosFilters, busca, page, pageSize }];
  const formLeadsQueryKey = ['atividade-leads', { empresa, editingId: editing?.id || null, leadId: editing?.lead_id || null }];
  const formAtendimentosQueryKey = ['atividade-planejadas', { empresa }];

  useEffect(() => {
    setPage(1);
  }, [agendaFiltro, busca, empresa, periodoFim, periodoInicio, responsavelFiltro, statusTab]);

  const { data: eventosPage = { rows: [], count: 0, page: 1, pageSize }, isFetching, isError, error: eventosError } = useQuery({
    queryKey: eventosQueryKey,
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      orderBy: '-updated_date',
      page,
      limit: pageSize,
      filters: eventosFilters,
      search: busca,
    }),
  });
  const eventos = eventosPage.rows;
  const totalPages = Math.max(1, Math.ceil((eventosPage.count || 0) / pageSize));

  const { data: eventosContadores = {
    agendaCounts: { atrasados: 0, hoje: 0, futuros: 0 },
    statusCounts: {},
  } } = useQuery({
    queryKey: ['eventos-contadores', { filters: resumoFilters, busca }],
    queryFn: async () => {
      const [statusResults, atrasados, hojeCount, futuros] = await Promise.all([
        Promise.all(STATUS_TABS.map((status) => (
          countAtividades({ ...resumoFilters, status }, busca).then((count) => [status, count])
        ))),
        countAtividades({ ...resumoFilters, status: 'planejada', ...getAgendaScopeDates('atrasados') }, busca),
        countAtividades({ ...resumoFilters, status: 'planejada', ...getAgendaScopeDates('hoje') }, busca),
        countAtividades({ ...resumoFilters, status: 'planejada', ...getAgendaScopeDates('futuros') }, busca),
      ]);

      return {
        agendaCounts: { atrasados, hoje: hojeCount, futuros },
        statusCounts: Object.fromEntries(statusResults),
      };
    },
  });

  const { data: leads = [] } = useQuery({
    queryKey: formLeadsQueryKey,
    enabled: formOpen,
    queryFn: async () => {
      const filters = {
        ...baseFilters,
        ...(editing?.lead_id ? {} : { status: ACTIVE_LEAD_STATUSES }),
      };
      const result = await crmDataClient.entities.Lead.listPage({
        orderBy: '-updated_date',
        limit: 300,
        filters,
      });
      const rows = result.rows || [];

      if (!editing?.lead_id || rows.some((lead) => lead.id === editing.lead_id)) {
        return rows;
      }

      const linkedLead = await crmDataClient.entities.Lead.get(editing.lead_id);
      return linkedLead ? [linkedLead, ...rows] : rows;
    },
  });

  const { data: atendimentosPlanejados = [] } = useQuery({
    queryKey: formAtendimentosQueryKey,
    enabled: formOpen,
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      orderBy: '-updated_date',
      limit: 300,
      filters: { ...baseFilters, status: 'planejada' },
    }).then((result) => result.rows || []),
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ['crm-responsaveis'],
    queryFn: () => crmDataClient.entities.Responsavel.list(),
  });

  const { data: motivosStatus = [] } = useQuery({
    queryKey: ['crm-motivos-status'],
    queryFn: () => crmDataClient.entities.MotivoStatus.list('nome'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['eventos'] });
    queryClient.invalidateQueries({ queryKey: ['eventos-contadores'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['atividade-leads'] });
    queryClient.invalidateQueries({ queryKey: ['atividade-planejadas'] });
    queryClient.invalidateQueries({ queryKey: ['clientes'] });
    queryClient.invalidateQueries({ queryKey: ['historico-atendimento'] });
    setFormOpen(false);
    setEditing(null);
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, data }) => id
      ? crmDataClient.entities.Atividade.update(id, data)
      : crmDataClient.entities.Atividade.create(data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['eventos'] });
      await queryClient.cancelQueries({ queryKey: ['leads'] });

      const previousEventos = queryClient.getQueryData(eventosQueryKey);
      const previousLeads = queryClient.getQueryData(formLeadsQueryKey);
      const now = new Date().toISOString();
      const tempId = id ? null : createTempId();
      const linkedLead = leads.find((lead) => lead.id === data.lead_id);

      queryClient.setQueryData(eventosQueryKey, (currentPage = eventosPage) => {
        const current = currentPage.rows || [];
        const nextRows = id
          ? current.map((evento) => (
              evento.id === id
                ? { ...evento, ...data, updated_date: now }
                : evento
            ))
          : [
              {
                id: tempId,
                created_date: now,
                updated_date: now,
                cliente_id: linkedLead?.cliente_id || data.cliente_id || '',
                cliente_nome: linkedLead?.nome || data.cliente_nome || '',
                telefone: linkedLead?.telefone || data.telefone || '',
                telefone_normalizado: linkedLead?.telefone_normalizado || data.telefone_normalizado || '',
                origem: linkedLead?.origem || data.origem || '',
                empresa: linkedLead?.empresa || data.empresa || 'Macom Ananindeua',
                modelo_interesse: linkedLead?.modelo_interesse || data.modelo_interesse || '',
                status: 'planejada',
                tipo_evento: 'ligacao',
                temperatura: 'morno',
                ...data,
              },
              ...current,
            ];
        return {
          ...currentPage,
          rows: nextRows,
          count: id ? currentPage.count : (currentPage.count || 0) + 1,
        };
      });

      if (data.status === 'concluida' && data.resultado === 'venda_realizada') {
        queryClient.setQueryData(formLeadsQueryKey, (current = []) =>
          current.map((lead) => lead.id === data.lead_id ? { ...lead, status: 'convertido' } : lead)
        );
      } else if (data.status === 'concluida' && data.resultado === 'lead_perdido') {
        queryClient.setQueryData(formLeadsQueryKey, (current = []) =>
          current.map((lead) => lead.id === data.lead_id
            ? { ...lead, status: 'perdido', motivo_perda: data.motivo_resultado || '' }
            : lead)
        );
      }

      return { previousEventos, previousLeads, tempId, id };
    },
    onSuccess: (saved, _data, context) => {
      queryClient.setQueryData(eventosQueryKey, (currentPage = eventosPage) => {
        const current = currentPage.rows || [];
        if (!saved) return currentPage;
        const rows = context?.tempId
          ? current.map((evento) => evento.id === context.tempId ? saved : evento)
          : current.map((evento) => evento.id === saved.id ? saved : evento);
        return { ...currentPage, rows };
      });
      invalidate();
    },
    onError: (error, _data, context) => {
      if (context?.previousEventos) {
        queryClient.setQueryData(eventosQueryKey, context.previousEventos);
      }
      if (context?.previousLeads) {
        queryClient.setQueryData(formLeadsQueryKey, context.previousLeads);
      }
      toast({
        title: 'Nao foi possivel salvar a atividade',
        description: error.message || 'Revise os dados informados.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Atividade.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['eventos'] });
      const previousEventos = queryClient.getQueryData(eventosQueryKey);
      queryClient.setQueryData(eventosQueryKey, (currentPage = eventosPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).filter((evento) => evento.id !== id),
        count: Math.max(0, (currentPage.count || 0) - 1),
      }));
      setFormOpen(false);
      setEditing(null);
      return { previousEventos };
    },
    onSuccess: invalidate,
    onError: (error, _id, context) => {
      if (context?.previousEventos) {
        queryClient.setQueryData(eventosQueryKey, context.previousEventos);
      }
      toast({
        title: 'Nao foi possivel excluir a atividade',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const porEmpresa = atendimentosPlanejados;
  const leadsDaEmpresa = leads;
  const counts = eventosContadores.statusCounts;

  const filtrados = eventos;

  const painelCounts = eventosContadores.agendaCounts;
  const selectAgendaFiltro = (scope) => {
    setAgendaFiltro((current) => current === scope ? 'todos' : scope);
    setStatusTab('planejada');
    setPeriodoInicio('');
    setPeriodoFim('');
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-5">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest">Agenda de Atividades</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mt-0.5">Contatos, tarefas e proximas acoes dos leads</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar cliente..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-9 w-52 bg-white text-sm rounded-none border-border"
            />
          </div>
          <Input
            type="date"
            value={periodoInicio}
            onChange={(event) => {
              setAgendaFiltro('todos');
              setPeriodoInicio(event.target.value);
            }}
            className="h-9 w-40 rounded-none bg-white text-xs"
            title="Inicio do periodo de proximo contato"
          />
          <Input
            type="date"
            value={periodoFim}
            onChange={(event) => {
              setAgendaFiltro('todos');
              setPeriodoFim(event.target.value);
            }}
            className="h-9 w-40 rounded-none bg-white text-xs"
            title="Fim do periodo de proximo contato"
          />
          <Select value={responsavelFiltro} onValueChange={setResponsavelFiltro}>
            <SelectTrigger className="h-9 w-52 rounded-none bg-white text-xs">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent className="rounded-none">
              <SelectItem value="todos">Todos os vendedores</SelectItem>
              {responsaveis.map((responsavel) => (
                <SelectItem key={responsavel.id} value={responsavel.id}>
                  {responsavel.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => { setEditing(null); setFormOpen(true); }}
            className="h-9 text-xs font-bold uppercase tracking-widest rounded-none px-5 bg-primary hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova Atividade
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="mb-4 border border-dashed border-red-300 bg-red-50 px-4 py-3 text-xs font-semibold uppercase tracking-widest text-red-700">
          {eventosError?.message || 'Nao foi possivel carregar as atividades.'}
        </div>
      ) : null}

      <div className="mb-3 grid gap-2 md:grid-cols-3">
        <button
          type="button"
          onClick={() => selectAgendaFiltro('atrasados')}
          className={cn(
            'flex items-center gap-3 bg-white px-4 py-3 text-left shadow-sm transition-colors',
            agendaFiltro === 'atrasados' ? 'ring-2 ring-red-500' : 'hover:bg-red-50'
          )}
        >
          <AlarmClock className="h-4 w-4 text-red-600" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Atrasados</p>
            <p className="text-lg font-black text-red-600">{painelCounts.atrasados}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => selectAgendaFiltro('hoje')}
          className={cn(
            'flex items-center gap-3 bg-white px-4 py-3 text-left shadow-sm transition-colors',
            agendaFiltro === 'hoje' ? 'ring-2 ring-amber-500' : 'hover:bg-amber-50'
          )}
        >
          <AlarmClock className="h-4 w-4 text-amber-500" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Hoje</p>
            <p className="text-lg font-black text-amber-500">{painelCounts.hoje}</p>
          </div>
        </button>
        <button
          type="button"
          onClick={() => selectAgendaFiltro('futuros')}
          className={cn(
            'flex items-center gap-3 bg-white px-4 py-3 text-left shadow-sm transition-colors',
            agendaFiltro === 'futuros' ? 'ring-2 ring-green-600' : 'hover:bg-green-50'
          )}
        >
          <AlarmClock className="h-4 w-4 text-green-600" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Futuros</p>
            <p className="text-lg font-black text-green-600">{painelCounts.futuros}</p>
          </div>
        </button>
      </div>

      <div className="min-w-0">
        <StatusTabs value={statusTab} onChange={setStatusTab} counts={counts} />
        <div className="mt-3 space-y-2">
          {filtrados.length === 0 ? (
            <div className="bg-white py-12 text-center shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Nenhuma atividade encontrada</p>
            </div>
          ) : (
            filtrados.map((evento) => (
              <EventoCard key={evento.id} evento={evento} onClick={() => { setEditing(evento); setFormOpen(true); }} />
            ))
          )}
        </div>
        <ListPagination
          className="mt-3"
          count={eventosPage.count}
          isFetching={isFetching}
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      </div>

      {formOpen && (
        <EventoForm
          key={editing?.id || 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          evento={editing}
          leads={leadsDaEmpresa}
          atendimentos={porEmpresa}
          motivosStatus={motivosStatus}
          onSave={(data) => saveMutation.mutate({ id: editing?.id || null, data })}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}
