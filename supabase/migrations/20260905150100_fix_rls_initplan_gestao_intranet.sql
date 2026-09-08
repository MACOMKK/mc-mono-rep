-- Corrige auth_rls_initplan (advisor de performance) nas policies do schema gestao_intranet:
-- troca auth.uid() por (select auth.uid()) para o Postgres avaliar uma vez por query em vez de
-- uma vez por linha. Mesma condicao, mesmo resultado de autorizacao -- so otimizacao. Ver
-- SUPABASE_PERFORMANCE_INVESTIGACAO.md, item A (lote 2/5, gestao_intranet).

alter policy intranet_google_calendar_manage_self on gestao_intranet.integracoes_google_calendar
  using (colaborador_id = (select auth.uid()))
  with check (colaborador_id = (select auth.uid()));

alter policy intranet_google_calendar_select_self on gestao_intranet.integracoes_google_calendar
  using (colaborador_id = (select auth.uid()));

alter policy intranet_google_oauth_state_manage_self on gestao_intranet.integracoes_google_oauth_state
  using (colaborador_id = (select auth.uid()))
  with check (colaborador_id = (select auth.uid()));

alter policy intranet_notificacoes_select_self on gestao_intranet.notificacoes
  using (colaborador_id = (select auth.uid()));

alter policy intranet_notificacoes_update_self on gestao_intranet.notificacoes
  using (colaborador_id = (select auth.uid()))
  with check (colaborador_id = (select auth.uid()));
