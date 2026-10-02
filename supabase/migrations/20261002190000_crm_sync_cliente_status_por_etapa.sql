-- Fase 2.2 (5/7) do PLANO_LEADS_PIPELINE: o cliente vira 'cliente' quando o lead entra em
-- uma etapa tipo 'ganho' (antes: quando leads.status virava 'convertido').
--
-- APLICAR JUNTO COM 20261002170000 e 20261002180000. Aquelas funcoes passaram a gravar so
-- etapa_id (o status e derivado por trg_crm_leads_a_sync_etapa). Trigger "UPDATE OF <coluna>"
-- so dispara quando a coluna esta no SET do UPDATE -- mudanca feita por trigger BEFORE nao
-- conta. Com o trigger antigo (UPDATE OF status), fechar venda deixaria de sincronizar o
-- cliente. Por isso o trigger passa a olhar status, etapa_id e etapa_tipo.
--
-- Sair da etapa de ganho continua sem reverter o cliente (como hoje).

create or replace function gestao_crm.sync_cliente_status_relacionamento()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.etapa_tipo = 'ganho' and old.etapa_tipo is distinct from 'ganho' then
    update gestao_crm.clientes_crm
    set status_relacionamento = 'cliente'
    where id = new.cliente_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_leads_sync_cliente_status on gestao_crm.leads;
create trigger trg_crm_leads_sync_cliente_status
after update of status, etapa_id, etapa_tipo on gestao_crm.leads
for each row
execute function gestao_crm.sync_cliente_status_relacionamento();

grant execute on function gestao_crm.sync_cliente_status_relacionamento() to authenticated, service_role;

comment on function gestao_crm.sync_cliente_status_relacionamento() is
  'Fonte unica de verdade para lead entrando em etapa tipo ganho -> clientes_crm.status_relacionamento=cliente. '
  'Disparado por UPDATE OF status, etapa_id, etapa_tipo em gestao_crm.leads (atividade, venda ou edicao '
  'manual). Os tres nomes no gatilho sao necessarios: UPDATE OF so enxerga colunas do SET, e quem grava so '
  'etapa_id (apply_activity_outcome/apply_venda_outcome) ou so status (Kanban atual) precisa disparar. '
  'Nao duplique este UPDATE em nenhuma funcao nova.';

notify pgrst, 'reload schema';
