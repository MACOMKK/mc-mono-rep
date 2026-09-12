import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { cn } from '@/lib/utils';
import { Phone, Car, Building2, CalendarClock, UserRound, AlertTriangle } from 'lucide-react';
import { ACTIVE_LEAD_STATUSES, LEAD_STATUS_LABEL } from '@/lib/leadStatus';

const COLUNAS = [
  { key: 'novo', color: 'border-t-blue-500', headerBg: 'bg-blue-500', dot: 'bg-blue-500' },
  { key: 'tentativa_contato', color: 'border-t-amber-400', headerBg: 'bg-amber-400', dot: 'bg-amber-400' },
  { key: 'em_contato', color: 'border-t-cyan-500', headerBg: 'bg-cyan-500', dot: 'bg-cyan-500' },
  { key: 'qualificado', color: 'border-t-violet-500', headerBg: 'bg-violet-500', dot: 'bg-violet-500' },
  { key: 'negociacao', color: 'border-t-orange-500', headerBg: 'bg-orange-500', dot: 'bg-orange-500' },
  { key: 'convertido', color: 'border-t-green-600', headerBg: 'bg-green-600', dot: 'bg-green-600' },
  { key: 'perdido', color: 'border-t-red-600', headerBg: 'bg-red-600', dot: 'bg-red-600' },
].map((col) => ({ ...col, label: LEAD_STATUS_LABEL[col.key] }));

const toLocalDate = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDate = (value) => {
  const date = toLocalDate(value);
  return date ? new Intl.DateTimeFormat('pt-BR').format(date) : '';
};

const formatShortDate = (value) => {
  const date = toLocalDate(value);
  return date
    ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
    : '';
};

const getClosingInfo = (lead) => {
  if (!lead.previsao_fechamento || ['convertido', 'perdido'].includes(lead.status)) return null;

  const dueDate = toLocalDate(lead.previsao_fechamento);
  if (!dueDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((dueDate.getTime() - today.getTime()) / 86400000);
  const formattedDate = formatDate(lead.previsao_fechamento);

  if (diffDays < 0) {
    return {
      label: `Fech. vencido`,
      title: `Fechamento vencido desde ${formattedDate}`,
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (diffDays === 0) {
    return {
      label: 'Fech. hoje',
      title: 'Fechamento previsto para hoje',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: `Fech. ${formatShortDate(lead.previsao_fechamento)}`,
    title: `Fechamento em ${formattedDate}`,
    className: 'border-slate-200 bg-slate-50 text-slate-600',
  };
};

function LeadCard({ lead, index, onClick, semContatoAgendado }) {
  const isSaving = String(lead.id).startsWith('temp-');
  const slaLabel = lead.sla_status === 'concluido'
    ? 'SLA ok'
    : lead.sla_status === 'atrasado'
      ? `SLA ${lead.sla_minutos_restantes ? `${Math.abs(lead.sla_minutos_restantes)}m atrasado` : 'atrasado'}`
      : lead.sla_status === 'alerta'
        ? `SLA ${Math.max(0, lead.sla_minutos_restantes || 0)}m`
        : 'SLA no prazo';
  const slaStyle = lead.sla_status === 'concluido'
    ? 'border-green-200 bg-green-50 text-green-700'
    : lead.sla_status === 'atrasado'
      ? 'border-red-200 bg-red-50 text-red-700'
      : lead.sla_status === 'alerta'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-blue-200 bg-blue-50 text-blue-700';
  const slaTitle = lead.sla_status === 'concluido'
    ? 'Primeiro contato realizado'
    : lead.sla_status === 'atrasado'
      ? 'SLA de primeiro contato atrasado'
      : lead.sla_status === 'alerta'
        ? 'SLA de primeiro contato perto do prazo'
        : 'SLA de primeiro contato no prazo';
  const closingInfo = getClosingInfo(lead);

  return (
    <Draggable draggableId={lead.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => { if (!isSaving) onClick(lead); }}
          className={cn(
            'bg-white border border-border shadow-sm p-3 select-none transition-shadow',
            isSaving ? 'cursor-wait opacity-60' : 'cursor-pointer',
            snapshot.isDragging ? 'shadow-xl rotate-1 opacity-95' : 'hover:shadow-md hover:border-primary/30'
          )}
        >
          <div className="flex items-start justify-between gap-1.5">
            <p className="font-bold text-sm leading-tight">{lead.nome}</p>
            {semContatoAgendado && (
              <span title="Sem contato agendado" className="shrink-0 mt-0.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              </span>
            )}
          </div>
          {isSaving && (
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Salvando...</p>
          )}
          {lead.modelo_interesse && (
            <p className="text-xs text-primary font-semibold mt-1 flex items-center gap-1">
              <Car className="w-3 h-3" />{lead.modelo_interesse}
            </p>
          )}
          <div className="mt-2 space-y-1">
            {lead.telefone && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" />{lead.telefone}
              </p>
            )}
            {lead.empresa && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" />{lead.empresa}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <UserRound className="w-3 h-3" />{lead.responsavel_nome || 'Distribuicao automatica'}
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ACTIVE_LEAD_STATUSES.includes(lead.status) ? (
                <span
                  title={slaTitle}
                  className={cn('inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', slaStyle)}
                >
                  <CalendarClock className="h-3 w-3" />{slaLabel}
                </span>
              ) : null}
              {closingInfo ? (
                <span
                  title={closingInfo.title}
                  className={cn('inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', closingInfo.className)}
                >
                  <CalendarClock className="h-3 w-3" />{closingInfo.label}
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-dashed border-border">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{lead.origem}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}

export default function LeadsKanban({ leads, onDragEnd, onCardClick, leadsComAtividadePendente }) {
  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto h-full items-stretch">
        {COLUNAS.map((col) => {
          const colLeads = leads.filter((l) => l.status === col.key);
          return (
            <div key={col.key} className={cn('flex flex-col h-full flex-1 min-w-[240px] max-w-[300px] bg-[#f4f4f4] border-t-4 shrink-0', col.color)}>
              {/* Column Header */}
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', col.dot)} />
                  <span className="text-[11px] font-black uppercase tracking-widest">{col.label}</span>
                </div>
                <span className="text-[10px] font-black bg-[#1a1a1a] text-white px-2 py-0.5 rounded-sm min-w-[20px] text-center">
                  {colLeads.length}
                </span>
              </div>

              {/* Droppable area */}
              <Droppable droppableId={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'px-2 pb-2 space-y-2 min-h-[200px] flex-1 overflow-y-auto scrollbar-none transition-colors',
                      snapshot.isDraggingOver ? 'bg-primary/5' : ''
                    )}
                  >
                    {colLeads.map((lead, index) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        index={index}
                        onClick={onCardClick}
                        semContatoAgendado={
                          ACTIVE_LEAD_STATUSES.includes(lead.status) &&
                          !leadsComAtividadePendente?.has(lead.id)
                        }
                      />
                    ))}
                    {provided.placeholder}
                    {colLeads.length === 0 && !snapshot.isDraggingOver && (
                      <div className="border-2 border-dashed border-border rounded-sm py-6 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">Arraste aqui</p>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
