-- Nivel 1 da auditoria do CRM (2026-10-20): 20261015120000 (corte da coluna leads.status) dropou
-- em cascata os indices que a referenciavam -- idx_crm_leads_empresa_status,
-- idx_crm_leads_responsavel_status, idx_crm_leads_status_criado_em,
-- idx_crm_leads_empresa_origem_status, idx_crm_leads_unidade_responsavel_status,
-- idx_crm_leads_unidade_status -- sem nenhum substituto equivalente sobre etapa_tipo (a coluna
-- que assumiu o papel de "status ativo/ganho/perdido" desde a fase 2.2/2.6). Sem eles, toda
-- consulta de escopo (buildAccessScope, gestor filtrando por unidade_id; crm-api combinando
-- empresa/origem_id/responsavel_id) cai em seq scan conforme a tabela cresce.

create index if not exists idx_crm_leads_unidade_etapa_tipo
  on gestao_crm.leads (unidade_id, etapa_tipo);

create index if not exists idx_crm_leads_responsavel_etapa_tipo
  on gestao_crm.leads (responsavel_id, etapa_tipo);

create index if not exists idx_crm_leads_empresa_etapa_tipo
  on gestao_crm.leads (empresa, etapa_tipo);

create index if not exists idx_crm_leads_empresa_origem_etapa_tipo
  on gestao_crm.leads (empresa, origem_id, etapa_tipo);

create index if not exists idx_crm_leads_unidade_responsavel_etapa_tipo
  on gestao_crm.leads (unidade_id, responsavel_id, etapa_tipo);

create index if not exists idx_crm_leads_etapa_tipo_criado_em
  on gestao_crm.leads (etapa_tipo, criado_em);

notify pgrst, 'reload schema';
