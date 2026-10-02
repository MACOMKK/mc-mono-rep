-- Fase 2.2 (indices) do PLANO_LEADS_PIPELINE: os indices parciais de leads passam a usar
-- leads.etapa_tipo (copia de etapas_pipeline.tipo, gravada por trg_crm_leads_a_sync_etapa) em vez
-- da lista fixa de status ativos.
--
-- - idx_crm_leads_cliente_ativo_unique: "1 lead ativo por cliente" passa a ser por pipeline,
--   (cliente_id, pipeline_id) where etapa_tipo = 'em_andamento'. Com 1 pipeline so, nada muda;
--   e o pre-requisito para o mesmo cliente ter um lead ativo no Comercial e outro no Consorcio
--   (2.7). O nome e mantido: crm-api e crmDataClient.js traduzem o erro pelo nome do indice.
-- - idx_crm_leads_sla_primeiro_contato: filtra primeiro_contato_em is null and etapa_tipo =
--   'em_andamento'.
--
-- Leads em etapa livre em_andamento passam a contar como ativos (antes contavam pelo status).

do $$
declare
  duplicados int;
begin
  select count(*)
  into duplicados
  from (
    select cliente_id, pipeline_id
    from gestao_crm.leads
    where etapa_tipo = 'em_andamento'
    group by cliente_id, pipeline_id
    having count(*) > 1
  ) d;

  if duplicados > 0 then
    raise exception 'Existem % cliente(s) com mais de um lead em etapa em andamento no mesmo pipeline. Resolva antes de aplicar esta migration.', duplicados;
  end if;
end;
$$;

drop index if exists gestao_crm.idx_crm_leads_cliente_ativo_unique;
create unique index idx_crm_leads_cliente_ativo_unique
  on gestao_crm.leads (cliente_id, pipeline_id)
  where etapa_tipo = 'em_andamento';

drop index if exists gestao_crm.idx_crm_leads_sla_primeiro_contato;
create index idx_crm_leads_sla_primeiro_contato
  on gestao_crm.leads (sla_primeiro_contato_em)
  where primeiro_contato_em is null
    and etapa_tipo = 'em_andamento';

comment on index gestao_crm.idx_crm_leads_cliente_ativo_unique is
  'Um lead em etapa tipo em_andamento por cliente e pipeline. Nome referenciado por crm-api (mapDatabaseError) '
  'e apps/crm/src/api/crmDataClient.js para a mensagem "Ja existe um lead ativo para este cliente.".';
