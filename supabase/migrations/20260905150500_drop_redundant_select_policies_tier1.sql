-- Corrige multiple_permissive_policies (advisor de performance) - Tier 1: policies "_select"
-- (FOR SELECT) com condicao identica a policy "_manage"/"ALL" correspondente na mesma tabela.
-- A policy FOR ALL ja cobre SELECT com a mesma condicao, entao a "_select" e' 100% redundante
-- (o Postgres avalia a mesma condicao duas vezes por linha). Nenhuma mudanca de quem acessa o
-- que - e' (X) OR (X) virando (X). Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 1.
--
-- Definicoes originais (para rollback via CREATE POLICY, caso necessario):
--
-- create policy crm_atendimentos_select on gestao_crm.atendimentos
--   for select using (crm_can_access_lead(lead_id));
--
-- create policy crm_conversas_atendimento_select on gestao_crm.conversas_atendimento
--   for select using (
--     ((lead_id is not null) and crm_can_access_lead(lead_id))
--     or ((cliente_id is not null) and crm_can_access_cliente(cliente_id))
--     or ((lead_id is null) and (cliente_id is null) and (crm_access_level() = 'admin'))
--   );
--
-- create policy crm_historico_atendimentos_select on gestao_crm.historico_atendimentos
--   for select using (
--     crm_can_access_cliente(cliente_id)
--     or ((lead_id is not null) and crm_can_access_lead(lead_id))
--   );
--
-- create policy crm_leads_select on gestao_crm.leads
--   for select using (crm_can_access_lead(id));
--
-- create policy crm_mensagens_atendimento_select on gestao_crm.mensagens_atendimento
--   for select using (
--     exists (
--       select 1 from gestao_crm.conversas_atendimento c
--       where c.id = mensagens_atendimento.conversa_id
--         and (
--           ((c.lead_id is not null) and crm_can_access_lead(c.lead_id))
--           or ((c.cliente_id is not null) and crm_can_access_cliente(c.cliente_id))
--           or ((c.lead_id is null) and (c.cliente_id is null) and (crm_access_level() = 'admin'))
--         )
--     )
--   );
--
-- create policy crm_veiculos_interesse_select on gestao_crm.veiculos_interesse
--   for select using (crm_can_access_lead(lead_id));
--
-- create policy intranet_google_calendar_select_self on gestao_intranet.integracoes_google_calendar
--   for select using (colaborador_id = (select auth.uid()));

drop policy crm_atendimentos_select on gestao_crm.atendimentos;
drop policy crm_conversas_atendimento_select on gestao_crm.conversas_atendimento;
drop policy crm_historico_atendimentos_select on gestao_crm.historico_atendimentos;
drop policy crm_leads_select on gestao_crm.leads;
drop policy crm_mensagens_atendimento_select on gestao_crm.mensagens_atendimento;
drop policy crm_veiculos_interesse_select on gestao_crm.veiculos_interesse;
drop policy intranet_google_calendar_select_self on gestao_intranet.integracoes_google_calendar;
