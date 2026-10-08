import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crmDataClient } from '@/api/crmDataClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, LayoutGrid, List, Search, RotateCcw } from 'lucide-react';
import LeadForm from '@/components/leads/LeadForm';
import MotivoStatusSelect from '@/components/leads/MotivoStatusSelect';
import LeadViewer from '@/components/leads/LeadViewer';
import LeadsKanban from '@/components/leads/LeadsKanban';
import EventoForm from '@/components/eventos/EventoForm';
import ListPagination from '@/components/ListPagination';
import { useEmpresa } from '@/context/EmpresaContext';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/use-toast';
import {
  etapaMotivoAplicaEm,
  findEtapaDoLead,
  getEtapaVisual,
  getLeadEtapaLabel,
} from '@/lib/leadStatus';
import { usePipelineEtapas } from '@/hooks/usePipelineEtapas';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

// Status que o lead assume ao entrar na etapa (espelho de trg_crm_leads_a_sync_etapa), so
// para o update otimista do Kanban -- o valor real volta do banco.
const statusOtimistaDaEtapa = (etapa, statusAtual) => {
  if (etapa.chave_sistema) return etapa.chave_sistema;
  if (etapa.tipo === 'ganho') return 'convertido';
  if (etapa.tipo === 'perdido') return 'perdido';
  return ['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao'].includes(statusAtual) ? statusAtual : 'em_contato';
};

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

const formatDateTime = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
  : '-';

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const canConfigure = user?.role === 'admin' || user?.role === 'manager';
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingLead, setViewingLead] = useState(null);
  const [leadParaExcluirTeste, setLeadParaExcluirTeste] = useState(null);
  const [activityFormOpen, setActivityFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null); // { lead, etapa }
  const [statusMotivoId, setStatusMotivoId] = useState('');
  const [statusFiltro, setStatusFiltro] = useState('todos'); // 'todos' ou id da etapa
  const [pipelineId, setPipelineId] = useState(null);
  const { pipeline, pipelines, etapas, etapasAtivas } = usePipelineEtapas({ pipelineId: pipelineId || undefined });
  const [viewMode, setViewMode] = useState('kanban');
  const [busca, setBusca] = useState('');
  const buscaDebounced = useDebouncedValue(busca);
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
    ...(pipeline?.id ? { pipeline_id: pipeline.id } : {}),
    ...(empresa !== 'Todas' ? { empresa } : {}),
    ...(statusFiltro !== 'todos' ? { etapa_id: statusFiltro } : {}),
    ...(responsavelFiltro !== 'todos' && responsavelFiltro !== 'sem_responsavel' ? { responsavel_id: responsavelFiltro } : {}),
    ...(responsavelFiltro === 'sem_responsavel' ? { responsavel_id: '__NULL__' } : {}),
    ...(origemFiltro !== 'todas' ? { origem_id: origemFiltro } : {}),
    ...(slaFiltro !== 'todos' ? { sla_status: slaFiltro } : {}),
    ...(periodoInicio ? { created_from: `${periodoInicio}T00:00:00` } : {}),
    ...(periodoFim ? { created_to: `${periodoFim}T23:59:59.999` } : {}),
  }), [empresa, origemFiltro, periodoFim, periodoInicio, pipeline?.id, responsavelFiltro, slaFiltro, statusFiltro]);

  const leadsQueryKey = ['leads', { filters, busca: buscaDebounced, page, pageSize }];

  useEffect(() => {
    setPage(1);
  }, [buscaDebounced, empresa, origemFiltro, periodoFim, periodoInicio, pipeline?.id, responsavelFiltro, slaFiltro, statusFiltro]);

  useEffect(() => {
    setStatusFiltro('todos');
  }, [pipeline?.id]);

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
  const KANBAN_LEADS_CAP = 500;
  // Kanban precisa do funil inteiro (nao so a pagina de 50 da tabela), senao leads antigos em
  // etapas avancadas somem sem aviso. count: false evita pagar a contagem num fetch em massa
  // (item 2 do plano de performance). Pede cap+1 pra saber se truncou sem precisar de um
  // segundo roundtrip so pra contar.
  const leadsKanbanQueryKey = ['leads-kanban', { filters, busca: buscaDebounced }];
  const { data: leadsKanbanRows = [] } = useQuery({
    queryKey: leadsKanbanQueryKey,
    enabled: kanbanAtivo,
    queryFn: () => crmDataClient.entities.Lead.listPage({
      orderBy: '-created_date',
      limit: KANBAN_LEADS_CAP + 1,
      filters,
      search: buscaDebounced,
      count: false,
    }).then((result) => result.rows || []),
  });
  const leadsKanban = leadsKanbanRows.slice(0, KANBAN_LEADS_CAP);
  const leadsKanbanTruncado = leadsKanbanRows.length > KANBAN_LEADS_CAP;
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

  // viewingLead e um snapshot tirado no clique (useState) -- sem isso, o modal aberto nao reflete
  // edicoes/trocas de etapa feitas por outro usuario via Realtime (o cache de ['leads']/
  // ['leads-kanban'] e atualizado, mas o snapshot em estado local nao). Reconcilia com a versao
  // mais recente presente em qualquer uma das duas listas cacheadas antes de repassar pro viewer.
  const viewingLeadAtual = useMemo(() => {
    if (!viewingLead) return null;
    const daTabela = leadsPage.rows?.find((item) => item.id === viewingLead.id);
    const doKanban = leadsKanbanRows?.find((item) => item.id === viewingLead.id);
    return daTabela || doKanban || viewingLead;
  }, [viewingLead, leadsPage.rows, leadsKanbanRows]);

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
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
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

  const excluirTesteMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Lead.excluirTeste(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      await queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
      setViewingLead(null);
      toast({ title: 'Lead de teste excluido', variant: 'success' });
    },
    onError: (error) => toast({
      title: 'Nao foi possivel excluir o lead',
      description: error.message || 'Tente novamente.',
      variant: 'destructive',
    }),
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

  const { data: activityFormAtendimentos = [] } = useQuery({
    queryKey: ['lead-atividades-planejadas', viewingLead?.id],
    enabled: activityFormOpen && Boolean(viewingLead?.id),
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      limit: 20,
      filters: { lead_id: viewingLead.id, status: 'planejada' },
    }).then((result) => result.rows || []),
  });

  const invalidateActivityQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['lead-atividades', viewingLead?.id] });
    queryClient.invalidateQueries({ queryKey: ['lead-atividades-planejadas', viewingLead?.id] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
    queryClient.invalidateQueries({ queryKey: ['eventos'] });
    queryClient.invalidateQueries({ queryKey: ['eventos-contadores'] });
    queryClient.invalidateQueries({ queryKey: ['crm-atividades-atrasadas'] });
  };

  const saveActivityMutation = useMutation({
    mutationFn: ({ id, data }) => (id
      ? crmDataClient.entities.Atividade.update(id, data)
      : crmDataClient.entities.Atividade.create(data)),
    onMutate: () => {
      setActivityFormOpen(false);
      setEditingActivity(null);
    },
    onSuccess: (_result, variables) => {
      invalidateActivityQueries();
      toast({
        title: variables.id ? 'Atividade atualizada' : 'Atividade criada',
        description: variables.id ? 'As alteracoes foram salvas.' : 'A atividade foi registrada para o lead.',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel salvar a atividade',
        description: error.message || 'Revise os dados informados.',
        variant: 'destructive',
      });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Atividade.delete(id),
    onSuccess: () => {
      invalidateActivityQueries();
      setActivityFormOpen(false);
      setEditingActivity(null);
      toast({ title: 'Atividade excluida', variant: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel excluir a atividade',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
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
    mutationFn: ({ id, etapa, ...extra }) => crmDataClient.entities.Lead.update(id, { etapa_id: etapa.id, etapa, ...extra }),
    onMutate: async ({ id, etapa }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previousLeads = queryClient.getQueryData(leadsQueryKey);
      const previousLeadsKanban = queryClient.getQueryData(leadsKanbanQueryKey);
      const applyEtapa = (lead) => (lead.id === id
        ? { ...lead, etapa_id: etapa.id, etapa_tipo: etapa.tipo, status: statusOtimistaDaEtapa(etapa, lead.status) }
        : lead);

      queryClient.setQueryData(leadsQueryKey, (currentPage = leadsPage) => ({
        ...currentPage,
        rows: (currentPage.rows || []).map(applyEtapa),
      }));
      // O drag-and-drop acontece na view Kanban, que desde o item 3 do plano de performance
      // busca o funil inteiro numa query propria (leads-kanban) -- precisa do mesmo update
      // otimista, senao o card volta pra coluna antiga ate o invalidate/refetch.
      queryClient.setQueryData(leadsKanbanQueryKey, (currentRows = []) => currentRows.map(applyEtapa));

      setStatusTarget(null);
      setStatusMotivoId('');

      return { previousLeads, previousLeadsKanban };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['leads-kanban'] });
      queryClient.invalidateQueries({ queryKey: ['clientes'] });
      queryClient.invalidateQueries({ queryKey: ['lead-historico', editingId] });
    },
    onError: (error, _variables, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey, context.previousLeads);
      }
      if (context?.previousLeadsKanban) {
        queryClient.setQueryData(leadsKanbanQueryKey, context.previousLeadsKanban);
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

  const [attachmentParaExcluir, setAttachmentParaExcluir] = useState(null);

  const deleteAttachment = (attachment) => {
    setAttachmentParaExcluir(attachment);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { draggableId, destination } = result;
    const etapa = etapas.find((item) => item.id === destination.droppableId);
    const lead = leads.find((l) => l.id === draggableId);
    if (!lead || !etapa || findEtapaDoLead(etapas, lead)?.id === etapa.id) return;

    if (etapaMotivoAplicaEm(etapa)) {
      setStatusTarget({ lead, etapa });
      setStatusMotivoId('');
      return;
    }

    updateStatusMutation.mutate({ id: draggableId, etapa });
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

  const counts = leads.reduce((acc, l) => {
    const etapaId = findEtapaDoLead(etapas, l)?.id;
    return etapaId ? { ...acc, [etapaId]: (acc[etapaId] || 0) + 1 } : acc;
  }, {});
  const editingNotes = editing
    ? historico.filter((item) => item.lead_id === editing.id && item.tipo === 'observacao' && item.metadados?.origem === 'lead_note')
    : [];
  const editingAttachments = editing
    ? historico.filter((item) => item.lead_id === editing.id && item.metadados?.origem === 'lead_attachment')
    : [];

  const STATUS_TABS = [{ id: 'todos', nome: 'Todos' }, ...etapasAtivas];

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
          {pipelines.length > 1 ? (
            <Select value={pipeline?.id || ''} onValueChange={(value) => setPipelineId(value)}>
              <SelectTrigger className="h-9 w-44 rounded-none text-xs font-bold uppercase tracking-wider">
                <SelectValue placeholder="Pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          {leadsKanbanTruncado && (
            <div className="shrink-0 rounded-none bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
              Mostrando {KANBAN_LEADS_CAP} de {KANBAN_LEADS_CAP}+ leads ativos — refine os filtros para ver todos.
            </div>
          )}
          <div className="flex-1 min-h-0">
            <LeadsKanban
              leads={leadsKanban}
              etapas={etapasAtivas}
              onDragEnd={handleDragEnd}
              onCardClick={(lead) => setViewingLead(lead)}
              leadsComAtividadePendente={leadsComAtividadePendente}
            />
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          <div className="flex gap-0 border-b border-border bg-white shadow-sm mb-4 overflow-x-auto">
            {STATUS_TABS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStatusFiltro(s.id)}
                className={cn(
                  'px-4 py-2.5 text-xs font-bold uppercase tracking-widest whitespace-nowrap border-b-2 -mb-px transition-all',
                  statusFiltro === s.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {s.nome}
                <span className={cn('ml-1.5 text-[10px] px-1.5 py-0.5 rounded-sm font-semibold', statusFiltro === s.id ? 'bg-primary text-white' : 'bg-muted text-muted-foreground')}>
                  {s.id === 'todos' ? leads.length : (counts[s.id] || 0)}
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
                  <TableHead className="text-white text-[10px] font-bold uppercase tracking-widest">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground py-10">
                      Nenhum lead encontrado
                    </TableCell>
                  </TableRow>
                ) : filtrados.map((lead, i) => {
                  const etapaVisual = getEtapaVisual(findEtapaDoLead(etapas, lead), { status: lead.status });
                  return (
                    <TableRow
                      key={lead.id}
                      className={cn('cursor-pointer hover:bg-red-50 transition-colors', i % 2 === 0 ? 'bg-white' : 'bg-[#f9f9f9]')}
                      onClick={() => setViewingLead(lead)}
                    >
                      <TableCell className="font-bold text-sm">
                        <div className="flex items-center gap-1.5">
                          {lead.nome}
                          {lead.eh_teste ? (
                            <span className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              Teste
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
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
                      <TableCell>
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm', etapaVisual.className)} style={etapaVisual.style}>
                          {getLeadEtapaLabel(etapas, lead)}
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
        lead={viewingLeadAtual}
        onEdit={() => {
          setEditing(viewingLeadAtual);
          setViewingLead(null);
          setFormOpen(true);
        }}
        onCreateActivity={() => { setEditingActivity(null); setActivityFormOpen(true); }}
        onSelectActivity={(atividade) => { setEditingActivity(atividade); setActivityFormOpen(true); }}
        onCreateProposta={() => viewingLeadAtual && navigate(`/propostas?leadId=${viewingLeadAtual.id}`)}
        canExcluirTeste={canConfigure}
        onExcluirTeste={() => setLeadParaExcluirTeste(viewingLeadAtual)}
      />

      {activityFormOpen && viewingLead && (
        <EventoForm
          open={activityFormOpen}
          onOpenChange={(next) => { setActivityFormOpen(next); if (!next) setEditingActivity(null); }}
          evento={editingActivity}
          initialLeadId={viewingLead.id}
          leads={[viewingLead]}
          atendimentos={activityFormAtendimentos}
          motivosStatus={motivosStatus}
          onSave={(data) => saveActivityMutation.mutate({ id: editingActivity?.id || null, data })}
          onDelete={(id) => deleteActivityMutation.mutate(id)}
        />
      )}

      {formOpen && (
        <LeadForm
          key={editing?.id || 'new'}
          open={formOpen}
          onOpenChange={setFormOpen}
          lead={editing}
          defaultPipelineId={!editing ? pipeline?.id : undefined}
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
        const motivoAplicaEm = statusTarget ? etapaMotivoAplicaEm(statusTarget.etapa) : null;
        const closeDialog = () => {
          setStatusTarget(null);
          setStatusMotivoId('');
        };
        const canSubmit = Boolean(statusTarget) && (!motivoAplicaEm || Boolean(statusMotivoId));

        return (
          <Dialog open={Boolean(statusTarget)} onOpenChange={(next) => { if (!next) closeDialog(); }}>
            <DialogContent className="max-w-md rounded-none p-0">
              <DialogHeader className={cn('px-6 py-4', statusTarget?.etapa?.tipo === 'perdido' ? 'bg-red-700' : 'bg-[#1a1a1a]')}>
                <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
                  Mover lead para {statusTarget?.etapa?.nome || ''}
                </DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!statusTarget || !canSubmit) return;
                  updateStatusMutation.mutate({
                    id: statusTarget.lead.id,
                    etapa: statusTarget.etapa,
                    ...(motivoAplicaEm ? { motivo_status_id: statusMotivoId } : {}),
                  });
                }}
                className="flex flex-col gap-4 p-6"
              >
                <p className="text-xs text-muted-foreground">
                  Informe os dados abaixo para mover <strong>{statusTarget?.lead?.nome}</strong> para {statusTarget?.etapa?.nome || ''}.
                </p>

                {motivoAplicaEm && (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Motivo</label>
                    <MotivoStatusSelect
                      aplicaEm={motivoAplicaEm}
                      value={statusMotivoId}
                      onChange={setStatusMotivoId}
                      motivosStatus={motivosStatus}
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

      <AlertDialog open={Boolean(attachmentParaExcluir)} onOpenChange={(open) => !open && setAttachmentParaExcluir(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-widest">Excluir anexo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{attachmentParaExcluir?.metadados?.nome || attachmentParaExcluir?.descricao || 'este anexo'}"? Essa acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs font-bold uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 text-xs font-bold uppercase tracking-wider hover:bg-red-700"
              onClick={() => {
                deleteAttachmentMutation.mutate(attachmentParaExcluir);
                setAttachmentParaExcluir(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(leadParaExcluirTeste)} onOpenChange={(open) => !open && setLeadParaExcluirTeste(null)}>
        <AlertDialogContent className="rounded-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-black uppercase tracking-widest">Excluir lead de teste</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o lead de teste "{leadParaExcluirTeste?.nome}"? Atendimentos, veiculos de
              interesse, propostas e vendas vinculados tambem serao excluidos. O cliente vinculado nao e afetado. Essa
              acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-none text-xs font-bold uppercase tracking-wider">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-none bg-red-600 text-xs font-bold uppercase tracking-wider hover:bg-red-700"
              onClick={() => {
                excluirTesteMutation.mutate(leadParaExcluirTeste.id);
                setLeadParaExcluirTeste(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
