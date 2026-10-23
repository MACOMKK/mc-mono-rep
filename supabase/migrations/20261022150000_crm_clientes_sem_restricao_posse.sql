-- Decisao de produto: a entidade clientes (identidade) deixa de ter restricao de
-- posse/unidade para qualquer nivel de acesso ao CRM -- qualquer vendedor pode buscar
-- um cliente e abrir um lead novo para ele (ja refletido em access-scope.ts, entity
-- 'clientes'). Antes disso, um cliente sem lead ja vinculado a um colaborador especifico
-- ficava invisivel para qualquer nivel exceto admin, travando o fluxo comercial (ex.:
-- cliente que entra via checklist, sem dono definido).
--
-- O que NAO muda: a entidade leads continua isolada por unidade (gestor) ou posse
-- (usuario), e as policies que usam crm_can_access_cliente() para proteger o
-- relacionamento/atendimento em si (historico_atendimentos, conversas_atendimento,
-- mensagens_atendimento) continuam usando essa funcao sem alteracao -- por isso a
-- funcao crm_can_access_cliente() nao e redefinida aqui, so as duas policies de
-- gestao_crm.clientes_crm passam a usar crm_has_access() (ja existente desde
-- 20260618150000_add_gestao_crm_core.sql: true para qualquer colaborador com acesso
-- ativo ao sistema CRM, em qualquer nivel).

drop policy if exists "crm_clientes_select" on gestao_crm.clientes_crm;
create policy "crm_clientes_select"
  on gestao_crm.clientes_crm
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_clientes_manage" on gestao_crm.clientes_crm;
create policy "crm_clientes_manage"
  on gestao_crm.clientes_crm
  for all
  to authenticated
  using (public.crm_has_access())
  with check (public.crm_has_access());

notify pgrst, 'reload schema';
