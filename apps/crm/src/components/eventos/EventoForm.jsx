import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2, Car, Phone, Tag, UserRound } from 'lucide-react';

import {
  ACTIVE_LEAD_STATUSES as ACTIVE_LEAD_STATUSES_LIST,
  LEAD_STATUS_REQUIREMENTS,
  RESULTADO_LEAD_STATUS_TARGET,
  isLeadEligibleForResultado,
} from '@/lib/leadStatus';
import MotivoStatusSelect from '@/components/leads/MotivoStatusSelect';

const ACTIVE_LEAD_STATUSES = new Set(ACTIVE_LEAD_STATUSES_LIST);
const PLANNED_ACTIVITY_STATUSES = new Set(['planejada']);

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function leadToEvento(lead, base = {}) {
  if (!lead) return base;

  return {
    ...base,
    lead_id: lead.id,
    cliente_id: lead.cliente_id,
    cliente_nome: lead.nome,
    telefone: lead.telefone,
    empresa: lead.empresa,
    origem: lead.origem,
    modelo_interesse: lead.modelo_interesse,
  };
}

function createInitialData(evento, leads, initialLeadId) {
  if (evento) {
    const linkedLead = leads.find((lead) => lead.id === evento.lead_id)
      || leads.find((lead) => lead.telefone_normalizado && lead.telefone_normalizado === evento.telefone_normalizado);
    return leadToEvento(linkedLead, evento);
  }

  const firstLead = initialLeadId
    ? leads.find((lead) => lead.id === initialLeadId)
    : leads.find((lead) => ACTIVE_LEAD_STATUSES.has(lead.status));

  return leadToEvento(firstLead, {
    lead_id: '',
    cliente_nome: '',
    telefone: '',
    titulo: '',
    status: 'planejada',
    tipo_evento: 'ligacao',
    origem: '',
    temperatura: 'morno',
    empresa: '',
    modelo_interesse: '',
    proximo_contato: '',
    observacoes: '',
    resultado: '',
    motivo_resultado: '',
    motivo_status_id: '',
    previsao_fechamento: '',
    proxima_atividade: {
      titulo: '',
      tipo_evento: 'ligacao',
      proximo_contato: '',
    },
  });
}

export default function EventoForm({ open, onOpenChange, evento, leads = [], atendimentos = [], motivosStatus = [], initialLeadId, onSave, onDelete }) {
  const availableLeads = useMemo(() => {
    const hasOpenAttendance = (leadId) => atendimentos.some((atendimento) => (
      atendimento.lead_id === leadId &&
      atendimento.id !== evento?.id &&
      PLANNED_ACTIVITY_STATUSES.has(atendimento.status)
    ));

    if (evento?.lead_id) {
      return leads.filter((lead) => (
        lead.id === evento.lead_id ||
        (ACTIVE_LEAD_STATUSES.has(lead.status) && !hasOpenAttendance(lead.id))
      ));
    }

    return leads.filter((lead) => ACTIVE_LEAD_STATUSES.has(lead.status) && !hasOpenAttendance(lead.id));
  }, [atendimentos, evento?.id, evento?.lead_id, leads]);

  const [data, setData] = useState(() => createInitialData(evento, availableLeads.length ? availableLeads : leads, initialLeadId));
  const selectedLead = leads.find((lead) => lead.id === data.lead_id);
  const isClosed = ['concluida', 'cancelada'].includes(evento?.status);
  const needsResult = data.status === 'concluida';
  const needsLossReason = needsResult && data.resultado === 'lead_perdido';
  const closesLead = needsResult && ['venda_realizada', 'lead_perdido'].includes(data.resultado);
  const needsNextActivity = needsResult && data.resultado && !closesLead && ACTIVE_LEAD_STATUSES.has(selectedLead?.status);
  const needsScheduledDate = data.status === 'planejada';

  const targetLeadStatus = needsResult ? RESULTADO_LEAD_STATUS_TARGET[data.resultado] : null;
  const willTransitionLead = Boolean(targetLeadStatus) && isLeadEligibleForResultado(data.resultado, selectedLead?.status);
  const targetRequirement = willTransitionLead ? LEAD_STATUS_REQUIREMENTS[targetLeadStatus] : null;
  const needsMotivoStatus = Boolean(targetRequirement?.motivo);
  const needsPrevisaoFechamento = Boolean(targetRequirement?.fields.includes('previsao_fechamento'));

  const canSave = Boolean(
    data.lead_id
    && data.titulo
    && (!needsScheduledDate || data.proximo_contato)
    && (!needsResult || data.resultado)
    && (!needsLossReason || String(data.motivo_resultado || '').trim())
    && (!needsMotivoStatus || data.motivo_status_id)
    && (!needsPrevisaoFechamento || data.previsao_fechamento)
    && (!needsNextActivity || (
      String(data.proxima_atividade?.titulo || '').trim()
      && data.proxima_atividade?.tipo_evento
      && data.proxima_atividade?.proximo_contato
    ))
  );

  const set = (field, value) => setData((current) => ({ ...current, [field]: value }));
  const setNextActivity = (field, value) => setData((current) => ({
    ...current,
    proxima_atividade: {
      ...(current.proxima_atividade || {}),
      [field]: value,
    },
  }));

  function selectLead(leadId) {
    const lead = leads.find((item) => item.id === leadId);
    setData((current) => leadToEvento(lead, current));
  }

  function setStatus(status) {
    setData((current) => ({
      ...current,
      status,
      resultado: status === 'concluida' ? current.resultado : '',
      motivo_resultado: status === 'concluida' ? current.motivo_resultado : '',
      motivo_status_id: status === 'concluida' ? current.motivo_status_id : '',
      previsao_fechamento: status === 'concluida' ? current.previsao_fechamento : '',
    }));
  }

  function setResultado(resultado) {
    setData((current) => {
      const targetStatus = RESULTADO_LEAD_STATUS_TARGET[resultado];
      const requirement = targetStatus ? LEAD_STATUS_REQUIREMENTS[targetStatus] : null;
      return {
        ...current,
        resultado,
        motivo_status_id: requirement?.motivo ? current.motivo_status_id : '',
        previsao_fechamento: requirement?.fields.includes('previsao_fechamento') ? current.previsao_fechamento : '',
      };
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-none p-0 gap-0">
        <DialogHeader className="bg-[#1a1a1a] px-6 py-4">
          <DialogTitle className="text-sm font-black uppercase tracking-widest text-white">
            {evento ? 'Editar Atividade' : 'Nova Atividade'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); if (canSave) onSave(data); }} className="space-y-4 p-6">
          <Field label="Lead vinculado *">
            {availableLeads.length > 0 ? (
              <Select value={data.lead_id} onValueChange={selectLead} disabled={Boolean(evento) || Boolean(initialLeadId)}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                <SelectContent className="rounded-none">
                  {availableLeads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.nome} - {lead.modelo_interesse || 'Modelo nao informado'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="border border-dashed bg-slate-50 px-3 py-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Nao ha lead ativo sem atividade planejada.
              </div>
            )}
          </Field>

          {selectedLead ? (
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 text-xs">
              <span className="flex items-center gap-2 font-semibold"><UserRound className="h-3.5 w-3.5" />{selectedLead.nome}</span>
              <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{selectedLead.telefone}</span>
              <span className="flex items-center gap-2 text-muted-foreground"><Car className="h-3.5 w-3.5" />{selectedLead.modelo_interesse || 'Modelo nao informado'}</span>
              <span className="flex items-center gap-2 text-muted-foreground"><Tag className="h-3.5 w-3.5" />{selectedLead.origem || 'Sem origem'}</span>
              <span className="col-span-2 flex items-center gap-2 text-muted-foreground"><Building2 className="h-3.5 w-3.5" />{selectedLead.empresa}</span>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Titulo do atendimento *">
                <Input required value={data.titulo} onChange={(event) => set('titulo', event.target.value)} className="h-9 rounded-none text-sm" />
              </Field>
            </div>
            <Field label="Status">
              <Select value={data.status} onValueChange={setStatus} disabled={isClosed}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="planejada">Planejada</SelectItem>
                  <SelectItem value="concluida">Concluida</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de atividade">
              <Select value={data.tipo_evento} onValueChange={(value) => set('tipo_evento', value)}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="ligacao">Ligacao</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="visita">Visita</SelectItem>
                  <SelectItem value="test_drive">Test-drive</SelectItem>
                  <SelectItem value="tarefa">Tarefa</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Temperatura">
              <Select value={data.temperatura} onValueChange={(value) => set('temperatura', value)}>
                <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-none">
                  <SelectItem value="frio">Frio</SelectItem>
                  <SelectItem value="morno">Morno</SelectItem>
                  <SelectItem value="quente">Quente</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label={needsScheduledDate ? 'Data da atividade *' : 'Data da atividade'}>
              <Input required={needsScheduledDate} type="date" value={data.proximo_contato} onChange={(event) => set('proximo_contato', event.target.value)} className="h-9 rounded-none text-sm" />
            </Field>
            {needsResult ? (
              <div className="col-span-2">
                <Field label="Resultado *">
                  <Select value={data.resultado || ''} onValueChange={setResultado} disabled={isClosed}>
                    <SelectTrigger className="h-9 rounded-none text-sm"><SelectValue placeholder="Selecione o resultado" /></SelectTrigger>
                    <SelectContent className="rounded-none">
                      <SelectItem value="contato_realizado">Contato realizado</SelectItem>
                      <SelectItem value="sem_resposta">Sem resposta</SelectItem>
                      <SelectItem value="visita_agendada">Visita agendada</SelectItem>
                      <SelectItem value="test_drive">Test-drive</SelectItem>
                      <SelectItem value="proposta_enviada">Proposta enviada</SelectItem>
                      <SelectItem value="venda_realizada">Venda realizada</SelectItem>
                      <SelectItem value="lead_perdido">Lead perdido</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : null}
            {needsLossReason ? (
              <div className="col-span-2">
                <Field label="Motivo da perda *">
                  <Textarea
                    required
                    value={data.motivo_resultado || ''}
                    onChange={(event) => set('motivo_resultado', event.target.value)}
                    disabled={isClosed}
                    className="resize-none rounded-none text-sm"
                    rows={2}
                  />
                </Field>
              </div>
            ) : null}
            {needsMotivoStatus ? (
              <div className="col-span-2">
                <Field label="Motivo *">
                  <MotivoStatusSelect
                    status={targetLeadStatus}
                    value={data.motivo_status_id || ''}
                    onChange={(value) => set('motivo_status_id', value)}
                    motivosStatus={motivosStatus}
                    disabled={isClosed}
                  />
                </Field>
              </div>
            ) : null}
            {needsPrevisaoFechamento ? (
              <div className="col-span-2">
                <Field label="Previsao de fechamento *">
                  <Input
                    required
                    type="date"
                    value={data.previsao_fechamento || ''}
                    onChange={(event) => set('previsao_fechamento', event.target.value)}
                    disabled={isClosed}
                    className="h-9 rounded-none text-sm"
                  />
                </Field>
              </div>
            ) : null}
            {needsNextActivity ? (
              <div className="col-span-2 border border-amber-200 bg-amber-50 p-4">
                <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Proxima atividade obrigatoria
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="Titulo da proxima atividade *">
                      <Input
                        required
                        value={data.proxima_atividade?.titulo || ''}
                        onChange={(event) => setNextActivity('titulo', event.target.value)}
                        className="h-9 rounded-none bg-white text-sm"
                      />
                    </Field>
                  </div>
                  <Field label="Acao *">
                    <Select
                      value={data.proxima_atividade?.tipo_evento || 'ligacao'}
                      onValueChange={(value) => setNextActivity('tipo_evento', value)}
                    >
                      <SelectTrigger className="h-9 rounded-none bg-white text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="ligacao">Ligacao</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="visita">Visita</SelectItem>
                        <SelectItem value="test_drive">Test-drive</SelectItem>
                        <SelectItem value="tarefa">Tarefa</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Data *">
                    <Input
                      required
                      type="date"
                      value={data.proxima_atividade?.proximo_contato || ''}
                      onChange={(event) => setNextActivity('proximo_contato', event.target.value)}
                      className="h-9 rounded-none bg-white text-sm"
                    />
                  </Field>
                </div>
              </div>
            ) : null}
            <div className="col-span-2">
              <Field label="Observacoes">
                <Textarea value={data.observacoes} onChange={(event) => set('observacoes', event.target.value)} className="resize-none rounded-none text-sm" rows={3} />
              </Field>
            </div>
          </div>
          <div className="flex justify-between border-t pt-2">
            {evento && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                className="rounded-none text-xs font-bold uppercase tracking-wider"
                onClick={() => {
                  const confirmed = window.confirm('Excluir esta atividade?');
                  if (!confirmed) return;
                  onDelete(evento.id);
                }}
              >
                Excluir
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="rounded-none text-xs font-bold uppercase tracking-wider" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSave} className="rounded-none bg-primary text-xs font-bold uppercase tracking-wider hover:bg-primary/90">
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
