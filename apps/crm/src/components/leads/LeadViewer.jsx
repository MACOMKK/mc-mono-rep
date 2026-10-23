import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { crmDataClient } from '@/api/crmDataClient';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { findEtapaDoLead, getEtapaVisual, getLeadEtapaLabel } from '@/lib/leadStatus';
import { usePipelineEtapas } from '@/hooks/usePipelineEtapas';
import EventoCard from '@/components/eventos/EventoCard';
import {
  Pencil,
  Phone,
  Mail,
  Car,
  Store,
  BriefcaseBusiness,
  UserRound,
  AlarmClock,
  LayoutDashboard,
  Target,
  CalendarClock,
  Paperclip,
  FileText,
  Handshake,
  History,
  Download,
  Upload,
  Trash2,
  ArrowLeftRight,
} from 'lucide-react';

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number);
}

function formatBytes(value = 0) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const PROPOSTA_STATUS_LABEL = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

const PROPOSTA_STATUS_BADGE = {
  rascunho: 'bg-slate-100 text-slate-700',
  enviada: 'bg-sky-100 text-sky-700',
  aceita: 'bg-emerald-100 text-emerald-700',
  recusada: 'bg-red-100 text-red-700',
};

function Item({ label, children }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-800">{children ?? '-'}</p>
    </div>
  );
}

function Block({ icon: Icon, title, children, action }) {
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </div>
        {action}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

function EmptyState({ children }) {
  return <p className="text-sm text-muted-foreground md:col-span-2">{children}</p>;
}

const ATIVIDADES_VISIVEIS = 4;

export default function LeadViewer({ open, onOpenChange, lead, onEdit, onCreateActivity, onSelectActivity, onCreateProposta, onExcluirTeste, canExcluirTeste, onMudarPipeline }) {
  const queryClient = useQueryClient();
  const veiculo = lead?.veiculo_interesse || null;
  const { etapas } = usePipelineEtapas({ pipelineId: lead?.pipeline_id || undefined });
  const etapaVisual = getEtapaVisual(findEtapaDoLead(etapas, lead), { etapaTipo: lead?.etapa_tipo });
  const [showAllAtividades, setShowAllAtividades] = useState(false);
  const [section, setSection] = useState('visao_geral');

  useEffect(() => {
    setShowAllAtividades(false);
    setSection('visao_geral');
  }, [lead?.id]);

  const { data: categoriasVeiculo = [] } = useQuery({
    queryKey: ['crm-categorias-veiculo'],
    queryFn: () => crmDataClient.entities.CategoriaVeiculo.list('nome'),
    enabled: open && Boolean(veiculo?.categoria_veiculo_id),
  });
  const categoria = categoriasVeiculo.find((item) => item.id === veiculo?.categoria_veiculo_id) || null;
  const camposExtraSegmento = categoria?.campos_extra || [];

  const { data: atividadesPage = { rows: [] } } = useQuery({
    queryKey: ['lead-atividades', lead?.id],
    queryFn: () => crmDataClient.entities.Atividade.listPage({
      orderBy: '-created_date',
      limit: 50,
      filters: { lead_id: lead.id },
    }),
    enabled: open && Boolean(lead?.id),
  });
  const atividades = atividadesPage.rows || [];
  const agendamentos = useMemo(
    () => atividades.filter((atividade) => atividade.status === 'planejada'),
    [atividades],
  );
  const { data: historicoPage = { rows: [] } } = useQuery({
    queryKey: ['lead-historico-viewer', lead?.id],
    queryFn: () => crmDataClient.entities.HistoricoAtendimento.listPage({
      orderBy: '-created_date',
      limit: 200,
      filters: { lead_id: lead.id },
    }),
    enabled: open && Boolean(lead?.id),
  });
  const historico = historicoPage.rows || [];
  const notas = historico.filter((item) => item.metadados?.origem === 'lead_note');
  const anexos = historico.filter((item) => item.metadados?.origem === 'lead_attachment');

  const { data: propostasPage = { rows: [] } } = useQuery({
    queryKey: ['lead-propostas', lead?.id],
    queryFn: () => crmDataClient.entities.Proposta.listPage({
      orderBy: '-created_date',
      limit: 50,
      filters: { lead_id: lead.id },
    }),
    enabled: open && Boolean(lead?.id),
  });
  const propostas = propostasPage.rows || [];

  const { data: vendasPage = { rows: [] } } = useQuery({
    queryKey: ['lead-vendas', lead?.id],
    queryFn: () => crmDataClient.entities.Venda.listPage({
      orderBy: '-created_date',
      limit: 10,
      filters: { lead_id: lead.id },
    }),
    enabled: open && Boolean(lead?.id) && lead?.etapa_tipo === 'ganho',
  });
  const vendas = vendasPage.rows || [];

  const openAttachment = async (anexo) => {
    try {
      await crmDataClient.entities.HistoricoAtendimento.openAttachment(anexo);
    } catch (error) {
      toast({
        title: 'Nao foi possivel abrir o anexo',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  };

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file) => crmDataClient.entities.HistoricoAtendimento.uploadLeadAttachment({ lead, file }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-historico-viewer', lead?.id] });
      toast({
        title: 'Anexo registrado',
        description: 'O arquivo foi vinculado ao lead.',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel anexar o arquivo',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const addAttachment = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) uploadAttachmentMutation.mutate(file);
  };

  const marcarPropostaEnviadaMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Proposta.marcarEnviada(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      toast({ title: 'Proposta marcada como enviada', variant: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel atualizar a proposta',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const recusarPropostaMutation = useMutation({
    mutationFn: (id) => crmDataClient.entities.Proposta.recusar(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-propostas', lead?.id] });
      queryClient.invalidateQueries({ queryKey: ['crm-propostas'] });
      toast({ title: 'Proposta recusada', variant: 'success' });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel recusar a proposta',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const [noteText, setNoteText] = useState('');

  const addNoteMutation = useMutation({
    mutationFn: ({ lead, text }) => crmDataClient.entities.HistoricoAtendimento.create({
      cliente_id: lead.cliente_id,
      lead_id: lead.id,
      tipo: 'observacao',
      descricao: text,
      entidade: 'Lead',
      entidade_id: lead.id,
      metadados: { origem: 'lead_note' },
    }),
    onSuccess: () => {
      setNoteText('');
      queryClient.invalidateQueries({ queryKey: ['lead-historico-viewer', lead?.id] });
      toast({
        title: 'Nota registrada',
        description: 'A nota foi vinculada ao lead.',
        variant: 'success',
      });
    },
    onError: (error) => {
      toast({
        title: 'Nao foi possivel registrar a nota',
        description: error.message || 'Tente novamente.',
        variant: 'destructive',
      });
    },
  });

  const saveNote = () => {
    const text = noteText.trim();
    if (!text || !lead) return;
    addNoteMutation.mutate({ lead, text });
  };

  if (!lead) return null;

  const NAV_SECTIONS = [
    { key: 'visao_geral', label: 'Visão Geral', icon: LayoutDashboard },
    { key: 'dados_pessoais', label: 'Dados Pessoais', icon: UserRound },
    { key: 'qualificacao', label: 'Qualificação', icon: Target },
    { key: 'agendamentos', label: 'Agendamentos', icon: CalendarClock, count: agendamentos.length },
    { key: 'documentos', label: 'Documentos', icon: Paperclip, count: anexos.length },
    { key: 'atividades', label: 'Atividades', icon: AlarmClock, count: atividades.length },
    { key: 'propostas', label: 'Propostas', icon: FileText, count: propostas.length },
    { key: 'pos_venda', label: 'Venda', icon: Handshake },
    { key: 'historico', label: 'Notas', icon: History, count: notas.length },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] max-h-[820px] w-[95vw] max-w-5xl flex-col gap-0 rounded-none p-0">
        <div className="flex shrink-0 items-center justify-between gap-3 bg-[#1a1a1a] px-6 py-4">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
              {lead.nome}
            </DialogTitle>
            {lead.eh_teste ? (
              <span className="rounded-full border border-white/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/80">
                Teste
              </span>
            ) : null}
          </div>
          <DialogDescription className="sr-only">Detalhes do lead {lead.nome}.</DialogDescription>
          <span className={cn('shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', etapaVisual.className)} style={etapaVisual.style}>
            {getLeadEtapaLabel(etapas, lead)}
          </span>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 overflow-y-auto border-r bg-slate-50 py-3 sm:w-48">
            {NAV_SECTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider transition-colors',
                  section === item.key
                    ? 'bg-white text-primary border-l-2 border-primary'
                    : 'text-muted-foreground border-l-2 border-transparent hover:bg-white/60 hover:text-foreground'
                )}
              >
                <span className="flex items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </span>
                {item.count ? (
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-700">{item.count}</span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {section === 'visao_geral' ? (
              <>
                <Block icon={LayoutDashboard} title="Situação">
                  <Item label="Etapa">{getLeadEtapaLabel(etapas, lead)}</Item>
                  <Item label="Origem">{lead.origem || '-'}</Item>
                  {lead.etapa_tipo === 'perdido' ? (
                    <Item label="Motivo da perda">{lead.motivo_perda || '-'}</Item>
                  ) : null}
                </Block>
                <Block icon={Store} title="Responsável">
                  <Item label="Empresa">{lead.empresa || '-'}</Item>
                  <Item label="Responsável">{lead.responsavel_nome || 'Distribuicao automatica'}</Item>
                  <Item label="Cadastrado em">{formatDateTime(lead.created_date)}</Item>
                  <Item label="Atualizado em">{formatDateTime(lead.updated_date)}</Item>
                </Block>
                {lead.observacoes ? (
                  <Block icon={BriefcaseBusiness} title="Observações">
                    <div className="md:col-span-2">
                      <p className="whitespace-pre-wrap text-sm text-slate-800">{lead.observacoes}</p>
                    </div>
                  </Block>
                ) : null}
              </>
            ) : null}

            {section === 'dados_pessoais' ? (
              <Block icon={UserRound} title="Contato">
                <Item label="Nome">{lead.nome}</Item>
                <Item label="Telefone">
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.telefone || '-'}</span>
                </Item>
                <Item label="E-mail">
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email || '-'}</span>
                </Item>
              </Block>
            ) : null}

            {section === 'qualificacao' ? (
              veiculo ? (
                <Block icon={Car} title="Veículo de interesse">
                  <Item label="Segmento">{categoria?.nome || '-'}</Item>
                  <Item label="Marca">{veiculo.marca || '-'}</Item>
                  <Item label="Modelo">{veiculo.modelo || '-'}</Item>
                  <Item label="Ano">{veiculo.ano || '-'}</Item>
                  <Item label="Condição">{veiculo.condicao || '-'}</Item>
                  <Item label="Versão">{veiculo.versao || '-'}</Item>
                  <Item label="Cor preferida">{veiculo.cor_preferida || '-'}</Item>
                  <Item label="Combustível">{veiculo.combustivel || '-'}</Item>
                  <Item label="Câmbio">{veiculo.cambio || '-'}</Item>
                  {(veiculo.faixa_preco_min || veiculo.faixa_preco_max) ? (
                    <Item label="Faixa de preço">
                      {[veiculo.faixa_preco_min, veiculo.faixa_preco_max].filter(Boolean).join(' - ')}
                    </Item>
                  ) : null}
                  {camposExtraSegmento.map((campo) => (
                    <Item key={campo.chave} label={campo.label || campo.chave}>
                      {veiculo.atributos?.[campo.chave] || '-'}
                    </Item>
                  ))}
                  {veiculo.observacoes ? (
                    <div className="md:col-span-2">
                      <Item label="Observações do veículo">{veiculo.observacoes}</Item>
                    </div>
                  ) : null}
                </Block>
              ) : (
                <Block icon={Car} title="Veículo de interesse">
                  <EmptyState>Nenhum veículo de interesse informado.</EmptyState>
                </Block>
              )
            ) : null}

            {section === 'agendamentos' ? (
              <Block icon={CalendarClock} title="Agendamentos">
                <div className="space-y-1.5 md:col-span-2">
                  {agendamentos.length === 0 ? (
                    <EmptyState>Nenhuma atividade planejada para este lead.</EmptyState>
                  ) : (
                    agendamentos.map((atividade) => (
                      <EventoCard
                        key={atividade.id}
                        evento={atividade}
                        compact
                        onClick={() => onSelectActivity?.(atividade)}
                      />
                    ))
                  )}
                </div>
              </Block>
            ) : null}

            {section === 'documentos' ? (
              <Block
                icon={Paperclip}
                title="Documentos"
                action={(
                  <label className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-none border border-dashed border-border px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-slate-50">
                    {uploadAttachmentMutation.isPending ? (
                      'Enviando...'
                    ) : (
                      <>
                        <Upload className="h-3 w-3" />
                        Adicionar anexo
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploadAttachmentMutation.isPending}
                      onChange={addAttachment}
                    />
                  </label>
                )}
              >
                <div className="space-y-1.5 md:col-span-2">
                  {anexos.length === 0 ? (
                    <EmptyState>Nenhum documento anexado a este lead.</EmptyState>
                  ) : (
                    anexos.map((anexo) => (
                      <div key={anexo.id} className="flex items-center justify-between gap-2 border px-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{anexo.metadados?.nome || anexo.descricao}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatBytes(anexo.metadados?.tamanho)} · {formatDateTime(anexo.created_date)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 shrink-0 rounded-none text-[10px] font-bold uppercase tracking-wider"
                          onClick={() => openAttachment(anexo)}
                        >
                          <Download className="mr-1 h-3 w-3" /> Abrir
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </Block>
            ) : null}

            {section === 'atividades' ? (
              <Block
                icon={AlarmClock}
                title="Atividades"
                action={onCreateActivity ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-none text-[10px] font-bold uppercase tracking-wider"
                    onClick={onCreateActivity}
                  >
                    Nova atividade
                  </Button>
                ) : null}
              >
                <div className="space-y-1.5 md:col-span-2">
                  {atividades.length === 0 ? (
                    <EmptyState>Nenhuma atividade registrada.</EmptyState>
                  ) : (
                    <>
                      {(showAllAtividades ? atividades : atividades.slice(0, ATIVIDADES_VISIVEIS)).map((atividade) => (
                        <EventoCard
                          key={atividade.id}
                          evento={atividade}
                          compact
                          onClick={() => onSelectActivity?.(atividade)}
                        />
                      ))}
                      {atividades.length > ATIVIDADES_VISIVEIS ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 w-full rounded-none text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAllAtividades((current) => !current)}
                        >
                          {showAllAtividades ? 'Mostrar menos' : `Mostrar todas (${atividades.length})`}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </Block>
            ) : null}

            {section === 'propostas' ? (
              <Block
                icon={FileText}
                title="Propostas"
                action={onCreateProposta ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-none text-[10px] font-bold uppercase tracking-wider"
                    onClick={onCreateProposta}
                  >
                    Nova proposta
                  </Button>
                ) : null}
              >
                <div className="space-y-1.5 md:col-span-2">
                  {propostas.length === 0 ? (
                    <EmptyState>Nenhuma proposta registrada para este lead.</EmptyState>
                  ) : (
                    propostas.map((proposta) => (
                      <div key={proposta.id} className="space-y-1.5 border px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-800">
                            {proposta.veiculo_descricao || 'Veículo do estoque'}
                          </p>
                          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider', PROPOSTA_STATUS_BADGE[proposta.status])}>
                            {PROPOSTA_STATUS_LABEL[proposta.status] || proposta.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {formatCurrency(proposta.valor_final)} · {formatDateTime(proposta.created_date)}
                        </p>
                        {proposta.status === 'rascunho' || proposta.status === 'enviada' ? (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {proposta.status === 'rascunho' ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-none text-[10px] font-bold uppercase tracking-wider"
                                disabled={marcarPropostaEnviadaMutation.isPending}
                                onClick={() => marcarPropostaEnviadaMutation.mutate(proposta.id)}
                              >
                                Marcar enviada
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-none text-[10px] font-bold uppercase tracking-wider text-red-600"
                              disabled={recusarPropostaMutation.isPending}
                              onClick={() => recusarPropostaMutation.mutate(proposta.id)}
                            >
                              Recusar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </Block>
            ) : null}

            {section === 'pos_venda' ? (
              <Block icon={Handshake} title="Venda">
                <div className="space-y-1.5 md:col-span-2">
                  {vendas.length === 0 ? (
                    <EmptyState>
                      {lead.etapa_tipo === 'ganho' ? 'Nenhuma venda vinculada a este lead.' : 'Este lead ainda não foi convertido em venda.'}
                    </EmptyState>
                  ) : (
                    vendas.map((venda) => (
                      <div key={venda.id} className="space-y-1 border px-3 py-2">
                        <p className="text-sm font-semibold text-slate-800">{formatCurrency(venda.valor_final)}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Fechada em {formatDate(venda.data_venda)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </Block>
            ) : null}

            {section === 'historico' ? (
              <Block icon={History} title="Notas">
                <div className="space-y-2 md:col-span-2">
                  <Textarea
                    value={noteText}
                    onChange={(event) => setNoteText(event.target.value)}
                    placeholder="Registrar nota comercial..."
                    className="resize-none rounded-none text-sm"
                    rows={2}
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-none text-[10px] font-bold uppercase tracking-wider"
                      disabled={!noteText.trim() || addNoteMutation.isPending}
                      onClick={saveNote}
                    >
                      {addNoteMutation.isPending ? 'Registrando...' : 'Adicionar nota'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  {notas.length === 0 ? (
                    <EmptyState>Nenhuma nota registrada.</EmptyState>
                  ) : (
                    notas.map((nota) => (
                      <div key={nota.id} className="border px-3 py-2">
                        <p className="whitespace-pre-wrap text-sm text-slate-800">{nota.descricao}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(nota.created_date)}</p>
                      </div>
                    ))
                  )}
                </div>
              </Block>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <div className="flex items-center gap-2">
            {lead.etapa_tipo === 'em_andamento' && onMudarPipeline ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-none text-xs font-bold uppercase tracking-wider"
                onClick={onMudarPipeline}
              >
                <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" /> Mudar de pipeline
              </Button>
            ) : null}
            {lead.eh_teste && canExcluirTeste ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-none text-xs font-bold uppercase tracking-wider text-red-600"
                onClick={onExcluirTeste}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir teste
              </Button>
            ) : null}
            <Button type="button" className="rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90" onClick={onEdit}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
