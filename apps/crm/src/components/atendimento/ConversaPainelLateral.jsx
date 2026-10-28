import { useQuery } from '@tanstack/react-query';
import { crmDataClient } from '@/api/crmDataClient';
import { Badge } from '@/components/ui/badge';

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
const MOCK_NOTA_INTERNA = 'Prefere contato por WhatsApp após 18h.';

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
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border px-3 py-3">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</span>
      {children}
    </div>
  );
}

function MaisInformacoesMock({ veiculoAtual, ultimaCompra }) {
  return (
    <SecaoMock titulo="Mais informações (exemplo)">
      <div className="flex flex-wrap gap-1.5">
        {MOCK_TAGS.map((tag) => (
          <Badge key={tag} variant="outline" className="rounded-full text-[10px]">
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
      <Campo label="Nota interna">{MOCK_NOTA_INTERNA}</Campo>
    </SecaoMock>
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

            <MaisInformacoesMock />
          </>
        ) : clienteId && cliente ? (
          <>
            <Campo label="Cliente">{cliente.nome}</Campo>
            <Campo label="Status">{cliente.status_relacionamento}</Campo>
            <Campo label="Email">{cliente.email}</Campo>
            <Campo label="Cidade/UF">{[cliente.municipio, cliente.uf].filter(Boolean).join('/')}</Campo>

            <MaisInformacoesMock veiculoAtual ultimaCompra />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os dados vinculados.</p>
        )}
      </div>
    </div>
  );
}
