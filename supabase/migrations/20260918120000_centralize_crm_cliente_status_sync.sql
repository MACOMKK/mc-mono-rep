-- Ate aqui, "leads.status = 'convertido' -> clientes_crm.status_relacionamento =
-- 'cliente'" so acontecia quando a conversao vinha de uma atividade concluida com
-- resultado 'venda_realizada' (dentro de apply_activity_outcome()). Editar o status do
-- lead direto pelo Kanban/LeadForm (via prepare_lead_phase1()) nunca sincronizava o
-- cliente -- e agora o novo caminho de gestao_crm.vendas (apply_venda_outcome())
-- tambem faria UPDATE leads sem essa sincronia.
--
-- Em vez de replicar o UPDATE clientes_crm pela terceira vez (o que e exatamente o tipo
-- de duplicacao que 20260917010000_document_lead_status_rules_sync.sql pede para
-- evitar), esta migration centraliza a regra num unico trigger em leads, disparado por
-- qualquer caminho que mude leads.status para 'convertido' -- atividade, edicao manual
-- ou venda.

create or replace function gestao_crm.sync_cliente_status_relacionamento()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.status = 'convertido' and (old.status is distinct from new.status) then
    update gestao_crm.clientes_crm
    set status_relacionamento = 'cliente'
    where id = new.cliente_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_leads_sync_cliente_status on gestao_crm.leads;
create trigger trg_crm_leads_sync_cliente_status
after update of status on gestao_crm.leads
for each row
execute function gestao_crm.sync_cliente_status_relacionamento();

grant execute on function gestao_crm.sync_cliente_status_relacionamento() to authenticated, service_role;

-- apply_activity_outcome() nao precisa mais tocar em clientes_crm diretamente: o
-- UPDATE leads abaixo ja dispara o trigger central acima.
create or replace function gestao_crm.apply_activity_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.status <> 'concluida' then
    return new;
  end if;

  update gestao_crm.leads
  set primeiro_contato_em = case
    when new.resultado <> 'sem_resposta' then coalesce(primeiro_contato_em, now())
    else primeiro_contato_em
  end
  where id = new.lead_id;

  if new.resultado = 'venda_realizada' then
    update gestao_crm.leads
    set status = 'convertido', motivo_status_id = new.motivo_status_id, convertido_em = coalesce(convertido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'lead_perdido' then
    update gestao_crm.leads
    set status = 'perdido', motivo_status_id = new.motivo_status_id, motivo_perda = new.motivo_resultado, perdido_em = coalesce(perdido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'proposta_enviada' then
    update gestao_crm.leads
    set status = 'negociacao', previsao_fechamento = new.previsao_fechamento
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');
  elsif new.resultado in ('visita_agendada', 'test_drive') then
    update gestao_crm.leads
    set status = 'qualificado', motivo_status_id = new.motivo_status_id
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado');
  elsif new.resultado = 'contato_realizado' then
    update gestao_crm.leads set status = 'em_contato'
    where id = new.lead_id and status in ('novo', 'tentativa_contato');
  elsif new.resultado = 'sem_resposta' then
    update gestao_crm.leads set status = 'tentativa_contato'
    where id = new.lead_id and status = 'novo';
  end if;

  return new;
end;
$$;

comment on function gestao_crm.prepare_lead_phase1() is
  'Exige motivo_status_id para qualificado/convertido/perdido e previsao_fechamento para negociacao. '
  'Mantenha em sincronia com gestao_crm.apply_activity_outcome(), gestao_crm.prepare_activity_business_state(), '
  'gestao_crm.prepare_venda_business_state()/apply_venda_outcome() e apps/crm/src/lib/leadStatus.js '
  '(LEAD_STATUS_REQUIREMENTS). A sincronizacao de clientes_crm.status_relacionamento para "convertido" e '
  'centralizada em gestao_crm.sync_cliente_status_relacionamento() (trigger em leads) -- nao replique esse '
  'UPDATE em nenhuma funcao nova. Teste: apps/crm/src/test/leadStatus.rules.test.js.';

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads (status, motivo_status_id, '
  'previsao_fechamento), com elegibilidade guardada por WHERE status IN (...). NAO atualiza '
  'clientes_crm.status_relacionamento diretamente -- isso e feito pelo trigger central '
  'gestao_crm.sync_cliente_status_relacionamento(). Mantenha em sincronia com '
  'gestao_crm.prepare_lead_phase1() e apps/crm/src/lib/leadStatus.js (RESULTADO_LEAD_STATUS_TARGET, '
  'isLeadEligibleForResultado). Teste: apps/crm/src/test/leadStatus.rules.test.js.';

comment on function gestao_crm.sync_cliente_status_relacionamento() is
  'Fonte unica de verdade para leads.status=convertido -> clientes_crm.status_relacionamento=cliente. '
  'Disparado por qualquer UPDATE OF status em gestao_crm.leads, seja vindo de '
  'gestao_crm.apply_activity_outcome(), de uma edicao manual (Kanban/LeadForm, via prepare_lead_phase1()) '
  'ou de gestao_crm.apply_venda_outcome(). Nao duplique este UPDATE em nenhuma funcao nova.';

notify pgrst, 'reload schema';
