import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Select de motivo (gestao_crm.motivos_status) filtrado pelo status de destino do lead.
// Usado em qualquer fluxo que mova um lead para um status que exige motivo (Kanban,
// LeadForm, conclusao de atividade) -- ver LEAD_STATUS_REQUIREMENTS em lib/leadStatus.js.
export default function MotivoStatusSelect({ status, value, onChange, motivosStatus, disabled }) {
  const opcoes = (motivosStatus || []).filter((m) => m.status === status && m.ativo);

  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="rounded-none">
        <SelectValue placeholder="Selecione um motivo" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum motivo cadastrado para este status.</div>
        ) : opcoes.map((motivo) => (
          <SelectItem key={motivo.id} value={motivo.id}>{motivo.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
