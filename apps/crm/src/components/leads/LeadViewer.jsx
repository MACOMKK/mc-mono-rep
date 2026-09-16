import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { crmDataClient } from '@/api/crmDataClient';
import { cn } from '@/lib/utils';
import { LEAD_STATUS_BADGE, LEAD_STATUS_LABEL } from '@/lib/leadStatus';
import EventoCard from '@/components/eventos/EventoCard';
import { Pencil, Phone, Mail, Car, Store, BriefcaseBusiness, UserRound, AlarmClock } from 'lucide-react';

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

function Item({ label, children }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm text-slate-800">{children ?? '-'}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="space-y-3 border-t pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

export default function LeadViewer({ open, onOpenChange, lead, onEdit }) {
  const veiculo = lead?.veiculo_interesse || null;

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

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 rounded-none p-0">
        <DialogHeader className="bg-[#1a1a1a] px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
              {lead.nome}
            </DialogTitle>
            <span className={cn('shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', LEAD_STATUS_BADGE[lead.status])}>
              {LEAD_STATUS_LABEL[lead.status] || lead.status}
            </span>
          </div>
          <DialogDescription className="sr-only">Detalhes do lead {lead.nome}.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <Section icon={UserRound} title="Contato">
            <Item label="Telefone">
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.telefone || '-'}</span>
            </Item>
            <Item label="E-mail">
              <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{lead.email || '-'}</span>
            </Item>
          </Section>

          <Section icon={BriefcaseBusiness} title="Comercial">
            <Item label="Origem">{lead.origem || '-'}</Item>
            <Item label="Previsao de fechamento">{formatDate(lead.previsao_fechamento)}</Item>
            {lead.status === 'perdido' ? (
              <Item label="Motivo da perda">{lead.motivo_perda || '-'}</Item>
            ) : null}
          </Section>

          <Section icon={AlarmClock} title="Atividades">
            <div className="space-y-2 md:col-span-2">
              {atividades.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
              ) : atividades.map((atividade) => (
                <EventoCard key={atividade.id} evento={atividade} onClick={() => {}} />
              ))}
            </div>
          </Section>

          {veiculo ? (
            <Section icon={Car} title="Veiculo de interesse">
              <Item label="Segmento">{categoria?.nome || '-'}</Item>
              <Item label="Marca">{veiculo.marca || '-'}</Item>
              <Item label="Modelo">{veiculo.modelo || '-'}</Item>
              <Item label="Ano">{veiculo.ano || '-'}</Item>
              <Item label="Condicao">{veiculo.condicao || '-'}</Item>
              <Item label="Versao">{veiculo.versao || '-'}</Item>
              <Item label="Cor preferida">{veiculo.cor_preferida || '-'}</Item>
              <Item label="Combustivel">{veiculo.combustivel || '-'}</Item>
              <Item label="Cambio">{veiculo.cambio || '-'}</Item>
              {(veiculo.faixa_preco_min || veiculo.faixa_preco_max) ? (
                <Item label="Faixa de preco">
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
                  <Item label="Observacoes do veiculo">{veiculo.observacoes}</Item>
                </div>
              ) : null}
            </Section>
          ) : null}

          <Section icon={Store} title="Responsavel">
            <Item label="Empresa">{lead.empresa || '-'}</Item>
            <Item label="Responsavel">{lead.responsavel_nome || 'Distribuicao automatica'}</Item>
            <Item label="Cadastrado em">{formatDateTime(lead.created_date)}</Item>
            <Item label="Atualizado em">{formatDateTime(lead.updated_date)}</Item>
          </Section>

          {lead.observacoes ? (
            <Section icon={BriefcaseBusiness} title="Observacoes">
              <div className="md:col-span-2">
                <p className="whitespace-pre-wrap text-sm text-slate-800">{lead.observacoes}</p>
              </div>
            </Section>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-white px-6 py-4">
          <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button type="button" className="rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90" onClick={onEdit}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
