-- Corrige auth_rls_initplan (advisor de performance) nas policies do schema gestao_plataforma:
-- troca auth.uid() por (select auth.uid()) para o Postgres avaliar uma vez por query em vez de
-- uma vez por linha. Mesma condicao, mesmo resultado de autorizacao -- so otimizacao. Ver
-- SUPABASE_PERFORMANCE_INVESTIGACAO.md, item A (lote 3/5, gestao_plataforma).

alter policy alertas_seguranca_enviados_select_admin_console on gestao_plataforma.alertas_seguranca_enviados
  using (
    exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = any (array['admin','gestor']))
  );

alter policy logs_acesso_plataforma_select_admin_console on gestao_plataforma.logs_acesso
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = any (array['admin','gestor'])))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = any (array['admin','gestor']) and s.slug = 'central' and s.ativo = true))
  );

alter policy logs_auditoria_plataforma_select_admin_console on gestao_plataforma.logs_auditoria
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = any (array['admin','gestor'])))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = any (array['admin','gestor']) and s.slug = 'central' and s.ativo = true))
  );
