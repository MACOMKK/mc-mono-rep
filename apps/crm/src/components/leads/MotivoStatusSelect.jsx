import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const APLICA_EM_FROM_STATUS = { qualificado: 'qualificado', convertido: 'ganho', perdido: 'perdido' };

// Select de motivo (gestao_crm.motivos_status) filtrado pelo tipo de motivo exigido pela etapa
// de destino (aplicaEm: qualificado | ganho | perdido -- ver etapaMotivoAplicaEm e
// resultadoMotivoAplicaEm em lib/leadStatus.js). Usado no Kanban, LeadForm e conclusao de
// atividade. `status` (legado) ainda e aceito e convertido para aplica_em.
export default function MotivoStatusSelect({ aplicaEm, status, value, onChange, motivosStatus, disabled }) {
  const tipo = aplicaEm || APLICA_EM_FROM_STATUS[status];
  const opcoes = (motivosStatus || []).filter(
    (m) => (m.aplica_em || APLICA_EM_FROM_STATUS[m.status]) === tipo && m.ativo,
  );

  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="rounded-none">
        <SelectValue placeholder="Selecione um motivo" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum motivo cadastrado para esta etapa.</div>
        ) : opcoes.map((motivo) => (
          <SelectItem key={motivo.id} value={motivo.id}>{motivo.nome}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
