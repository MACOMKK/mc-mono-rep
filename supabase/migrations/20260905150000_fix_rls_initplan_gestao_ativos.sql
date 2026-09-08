-- Corrige auth_rls_initplan (advisor de performance) nas policies do schema gestao_ativos:
-- troca auth.uid() por (select auth.uid()) para o Postgres avaliar uma vez por query em vez de
-- uma vez por linha. Mesma condicao, mesmo resultado de autorizacao -- so otimizacao. Ver
-- SUPABASE_PERFORMANCE_INVESTIGACAO.md, item A (lote 1/5, gestao_ativos).

alter policy logs_auditoria_select_admin_central on gestao_ativos.logs_auditoria
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'central' and s.ativo = true))
  );

alter policy permissoes_central_select_admin_gestor on gestao_ativos.permissoes_central
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = any (array['admin','gestor'])))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = any (array['admin','gestor']) and s.slug = 'central' and s.ativo = true))
  );

alter policy permissoes_central_write_admin on gestao_ativos.permissoes_central
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'central' and s.ativo = true))
  )
  with check (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'central' and s.ativo = true))
  );

alter policy permissoes_central_nivel_select on gestao_ativos.permissoes_central_nivel
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = any (array['admin','gestor'])))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = any (array['admin','gestor']) and s.slug = 'central' and s.ativo = true))
  );

alter policy permissoes_central_nivel_write on gestao_ativos.permissoes_central_nivel
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'central' and s.ativo = true))
  )
  with check (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'central' and s.ativo = true))
  );
