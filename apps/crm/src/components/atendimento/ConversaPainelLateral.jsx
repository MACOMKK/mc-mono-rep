import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus } from 'lucide-react';
import { crmDataClient } from '@/api/crmDataClient';
import { atendimentoApi } from '@/api/atendimentoApi';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import LeadForm from '@/components/leads/LeadForm';

const ETAPA_TIPO_LABEL = {
  em_andamento: 'Em andamento',
  convertido: 'Convertido',
  perdido: 'Perdido',
};

const ETAPA_TIPO_STYLES = {
  em_andamento: 'bg-blue-100 text-blue-700',
  convertido: 'bg-emerald-100 text-emerald-700',
  perdido: 'bg-muted text-muted-foreground',
};

// Dados mockados do modelo Lovable, sem fonte real ainda -- trocar por dado de verdade
// conforme as colunas/entidades forem existindo (sistema ainda em teste, sem uso real).
const MOCK_VEICULO_ATUAL = { modelo: 'Onix LTZ 2022', placa: 'ABC1D23', km: '32.400 km' };
const MOCK_TAGS = ['Cliente recorrente', 'Interessado em troca'];
const MOCK_ULTIMA_COMPRA = 'há 8 meses';
const MOCK_TICKET_MEDIO = 'R$ 68.500';
const MOCK_SATISFACAO = '4,6/5 (12 avaliações)';

// Atendimento guarda telefone_normalizado com DDI 55 (normalizeBrazilianMobile em
// whatsapp-api/index.ts); lead/cliente exigem telefone sem DDI, so DDD+numero
// (requireNormalizedPhone em crmDataClient.js). Converter antes de usar como valor inicial.
function toLeadPhoneFormat(telefoneAtendimento = '') {
  const digits = String(telefoneAtendimento).replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}

function Campo({ label, children }) {
  if (!children) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function SecaoMock({ titulo, children }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-3 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">{titulo}</span>
      {children}
    </div>
  );
}

function MaisInformacoesMock({ veiculoAtual, ultimaCompra }) {
  return (
    <SecaoMock titulo="Mais informações (exemplo)">
      <div className="flex flex-wrap gap-1.5">
        {MOCK_TAGS.map((tag) => (
          <Badge key={tag} variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-[10px] text-violet-700">
            {tag}
          </Badge>
        ))}
      </div>
      {veiculoAtual && (
        <Campo label="Veículo atual">
          {MOCK_VEICULO_ATUAL.modelo} · {MOCK_VEICULO_ATUAL.placa} · {MOCK_VEICULO_ATUAL.km}
        </Campo>
      )}
      {ultimaCompra && <Campo label="Última compra">{MOCK_ULTIMA_COMPRA}</Campo>}
      <Campo label="Ticket médio">{MOCK_TICKET_MEDIO}</Campo>
      <Campo label="Satisfação (CSAT)">{MOCK_SATISFACAO}</Campo>
    </SecaoMock>
  );
}

function formatMesesDesde(dataIso) {
  if (!dataIso) return '';
  const data = new Date(dataIso);
  if (Number.isNaN(data.getTime())) return '';
  const meses = Math.max(0, Math.floor((Date.now() - data.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  if (meses <= 0) return 'este mês';
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
}

function formatMoeda(valor) {
  if (valor === null || valor === undefined) return '';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Card 3 do Trello (Atendimento): substitui MOCK_VEICULO_ATUAL/MOCK_ULTIMA_COMPRA/
// MOCK_TICKET_MEDIO/MOCK_SATISFACAO por dado real so quando ha cliente vinculado (unica
// entidade com vendas de verdade -- lead ainda nao comprou nada).
function ResumoVendasCliente({ cliente }) {
  const { data: resumo, isLoading } = useQuery({
    queryKey: ['cliente-resumo-vendas', cliente.id],
    queryFn: () => crmDataClient.entities.Cliente.getResumoVendas(cliente.id),
    enabled: Boolean(cliente.id),
  });

  if (isLoading) return null;

  const tags = cliente.tags || [];

  return (
    <SecaoMock titulo="Mais informações">
      {(tags.length > 0 || resumo?.cliente_recorrente) && (
        <div className="flex flex-wrap gap-1.5">
          {resumo?.cliente_recorrente && (
            <Badge variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-[10px] text-violet-700">
              Cliente recorrente
            </Badge>
          )}
          {tags.map((tag) => (
            <Badge key={tag} variant="outline" className="rounded-full border-violet-200 bg-violet-50 text-[10px] text-violet-700">
              {tag}
            </Badge>
          ))}
        </div>
      )}
      {resumo?.veiculo_atual && (
        <Campo label="Veículo atual">
          {[resumo.veiculo_atual.modelo, resumo.veiculo_atual.placa, resumo.veiculo_atual.km ? `${resumo.veiculo_atual.km} km` : null]
            .filter(Boolean)
            .join(' · ')}
        </Campo>
      )}
      {resumo?.ultima_compra_em && <Campo label="Última compra">{formatMesesDesde(resumo.ultima_compra_em)}</Campo>}
      {resumo?.ticket_medio != null && <Campo label="Ticket médio">{formatMoeda(resumo.ticket_medio)}</Campo>}
      {resumo?.avaliacoes?.total > 0 && (
        <Campo label="Satisfação (CSAT)">
          {resumo.avaliacoes.media}/5 ({resumo.avaliacoes.total} avaliaç{resumo.avaliacoes.total === 1 ? 'ão' : 'ões'})
        </Campo>
      )}
    </SecaoMock>
  );
}

function NotaInternaLead({ lead }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState(lead.observacoes || '');

  useEffect(() => {
    setTexto(lead.observacoes || '');
  }, [lead.id, lead.observacoes]);

  const salvarMutation = useMutation({
    mutationFn: (observacoes) => crmDataClient.entities.Lead.update(lead.id, { observacoes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['atendimento-painel-lead', lead.id] });
    },
    onError: () => {
      toast({ title: 'Não foi possível salvar a nota interna.', variant: 'destructive' });
    },
  });

  const handleBlur = () => {
    const trimmed = texto.trim();
    if (trimmed === (lead.observacoes || '').trim()) return;
    salvarMutation.mutate(trimmed);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nota interna</span>
      <Textarea
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        onBlur={handleBlur}
        placeholder="Anotações internas sobre este lead..."
        rows={3}
        className="resize-none text-sm"
      />
      {salvarMutation.isPending && <span className="text-[10px] text-muted-foreground">Salvando...</span>}
    </div>
  );
}

function VincularLeadPanel({ conversa }) {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [formAberto, setFormAberto] = useState(false);
  const buscaDebounced = useDebouncedValue(busca, 300);

  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ['atendimento-leads-busca'],
    queryFn: () => crmDataClient.entities.Lead.list('-created_date', 300),
  });

  const { data: responsaveis = [] } = useQuery({
    queryKey: ['crm-responsaveis'],
    queryFn: () => crmDataClient.entities.Responsavel.list(),
  });

  // Mesma query/cache key do LeadForm -- reaproveita o fetch já feito lá. Lead criado a partir de
  // uma conversa de Atendimento sempre veio por WhatsApp, nunca Site (default do LeadForm quando
  // aberto sem origem pré-definida).
  const { data: origensLead = [] } = useQuery({
    queryKey: ['crm-origens-lead'],
    queryFn: () => crmDataClient.entities.OrigemLead.list('nome'),
  });
  const origemWhatsappId = useMemo(
    () => origensLead.find((item) => item.nome.toLowerCase() === 'whatsapp')?.id || '',
    [origensLead],
  );

  const leadsFiltrados = useMemo(() => {
    const termo = buscaDebounced.trim().toLowerCase();
    const digitos = buscaDebounced.replace(/\D/g, '');
    if (!termo) return [];

    return leads
      .filter((item) => {
        const nome = (item.nome || '').toLowerCase();
        if (nome.includes(termo)) return true;
        if (digitos && (item.telefone_normalizado || '').includes(digitos)) return true;
        return false;
      })
      .slice(0, 20);
  }, [leads, buscaDebounced]);

  const vincularMutation = useMutation({
    mutationFn: (leadId) => atendimentoApi.vincularLead(conversa.id, leadId),
    onSuccess: (_, leadId) => {
      queryClient.setQueryData(['conversas-atendimento'], (old = []) =>
        old.map((item) => (item.id === conversa.id ? { ...item, lead_id: leadId } : item)));
      queryClient.invalidateQueries({ queryKey: ['conversas-atendimento'] });
      toast({ title: 'Conversa vinculada ao lead.' });
    },
    onError: () => {
      toast({ title: 'Não foi possível vincular o lead.', variant: 'destructive' });
    },
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background px-3 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Vincular a um lead
      </span>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="h-8 pl-7 text-sm"
        />
      </div>

      {isLoadingLeads && busca ? (
        <p className="text-xs text-muted-foreground">Buscando...</p>
      ) : leadsFiltrados.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {leadsFiltrados.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={vincularMutation.isPending}
              onClick={() => vincularMutation.mutate(item.id)}
              className="flex flex-col rounded-md border border-border px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
            >
              <span className="font-semibold">{item.nome || 'Sem nome'}</span>
              <span className="text-muted-foreground">{item.telefone}</span>
            </button>
          ))}
        </div>
      ) : buscaDebounced.trim() ? (
        <p className="text-xs text-muted-foreground">Nenhum lead encontrado.</p>
      ) : null}

      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setFormAberto(true)}>
        <UserPlus className="h-3.5 w-3.5" />
        Criar lead a partir do contato
      </Button>

      {formAberto && (
        <LeadForm
          open={formAberto}
          onOpenChange={setFormAberto}
          responsaveis={responsaveis}
          lead={{
            nome: '',
            telefone: toLeadPhoneFormat(conversa.telefone_normalizado),
            email: '',
            cpf_cnpj: '',
            origem_id: origemWhatsappId,
            modelo_interesse: '',
            veiculo_interesse: {
              marca: '',
              modelo: '',
              marca_id: null,
              modelo_id: null,
              marca_outro: '',
              modelo_outro: '',
              versao_id: null,
              versao_outro: '',
              versao: '',
              ano: '',
              categoria_veiculo_id: null,
              condicao: '',
              faixa_preco_min: '',
              faixa_preco_max: '',
              cor_preferida: '',
              combustivel: '',
              cambio: '',
              atributos: {},
              observacoes: '',
            },
            empresa: 'Macom Ananindeua',
            responsavel_id: '',
            motivo_status_id: '',
            motivo_perda: '',
            observacoes: '',
          }}
          onSave={async (data) => {
            const novoLead = await crmDataClient.entities.Lead.create(data);
            await vincularMutation.mutateAsync(novoLead.id);
            setFormAberto(false);
          }}
        />
      )}
    </div>
  );
}

export default function ConversaPainelLateral({ conversa }) {
  const leadId = conversa?.lead_id || '';
  const clienteId = !leadId && conversa?.cliente_id ? conversa.cliente_id : '';

  const { data: lead, isLoading: isLoadingLead } = useQuery({
    queryKey: ['atendimento-painel-lead', leadId],
    queryFn: () => crmDataClient.entities.Lead.get(leadId),
    enabled: Boolean(leadId),
  });

  const { data: cliente, isLoading: isLoadingCliente } = useQuery({
    queryKey: ['atendimento-painel-cliente', clienteId],
    queryFn: () => crmDataClient.entities.Cliente.get(clienteId),
    enabled: Boolean(clienteId),
  });

  const isLoading = isLoadingLead || isLoadingCliente;

  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border bg-background">
      <div className="border-b border-border bg-background px-4 py-4 shadow-sm">
        <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Dados vinculados</h2>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted/20 px-4 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !leadId && !clienteId ? (
          <>
            <p className="text-sm text-muted-foreground">Esta conversa ainda não está vinculada a um lead ou cliente.</p>
            <VincularLeadPanel conversa={conversa} />
            <MaisInformacoesMock veiculoAtual ultimaCompra />
          </>
        ) : leadId && lead ? (
          <>
            <Campo label="Lead">{lead.nome}</Campo>
            <Campo label="Status">
              <Badge className={`rounded-full text-[10px] uppercase tracking-wide ${ETAPA_TIPO_STYLES[lead.etapa_tipo] || ''}`}>
                {ETAPA_TIPO_LABEL[lead.etapa_tipo] || lead.etapa_tipo}
              </Badge>
            </Campo>
            <Campo label="Veículo de interesse">{lead.modelo_interesse}</Campo>
            <Campo label="Origem">{lead.origem}</Campo>
            <Campo label="Responsável">{lead.responsavel_nome}</Campo>

            <NotaInternaLead lead={lead} />

            <MaisInformacoesMock />
          </>
        ) : clienteId && cliente ? (
          <>
            <Campo label="Cliente">{cliente.nome}</Campo>
            <Campo label="Status">{cliente.status_relacionamento}</Campo>
            <Campo label="Email">{cliente.email}</Campo>
            <Campo label="Cidade/UF">{[cliente.municipio, cliente.uf].filter(Boolean).join('/')}</Campo>

            <ResumoVendasCliente cliente={cliente} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os dados vinculados.</p>
        )}
      </div>
    </div>
  );
}
