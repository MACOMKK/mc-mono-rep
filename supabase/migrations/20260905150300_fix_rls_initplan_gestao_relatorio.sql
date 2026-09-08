-- Corrige auth_rls_initplan (advisor de performance) nas policies do schema gestao_relatorio:
-- troca auth.uid() por (select auth.uid()) para o Postgres avaliar uma vez por query em vez de
-- uma vez por linha. Mesma condicao, mesmo resultado de autorizacao -- so otimizacao.
-- relatorios_is_admin() e' funcao a parte, nao mexida aqui. Ver
-- SUPABASE_PERFORMANCE_INVESTIGACAO.md, item A (lote 4/5, gestao_relatorio).

alter policy avisos_relatorios_select_admin_or_permitted on gestao_relatorio.avisos_relatorios
  using (
    relatorios_is_admin()
    or (
      ativo = true
      and exists (
        select 1 from gestao_relatorio.permissoes_relatorios pr
        where pr.colaborador_id = (select auth.uid()) and pr.relatorio_id = avisos_relatorios.relatorio_id
      )
    )
  );

alter policy avisos_relatorios_aceites_insert_own on gestao_relatorio.avisos_relatorios_aceites
  with check (
    relatorios_is_admin()
    or (
      colaborador_id = (select auth.uid())
      and exists (
        select 1
        from gestao_relatorio.avisos_relatorios ar
        join gestao_relatorio.permissoes_relatorios pr on pr.relatorio_id = ar.relatorio_id
        where ar.id = avisos_relatorios_aceites.aviso_id
          and ar.relatorio_id = avisos_relatorios_aceites.relatorio_id
          and ar.ativo = true
          and pr.colaborador_id = (select auth.uid())
      )
    )
  );

alter policy avisos_relatorios_aceites_select_admin_or_own on gestao_relatorio.avisos_relatorios_aceites
  using (relatorios_is_admin() or (colaborador_id = (select auth.uid())));

alter policy permissoes_funcoes_select_admin_relatorios on gestao_relatorio.permissoes_funcoes
  using (
    (exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from public.acessos_usuario_sistema aus
      join public.sistemas s on s.id = aus.sistema_id
      where aus.colaborador_id = (select auth.uid()) and aus.ativo = true
        and aus.nivel_acesso = 'admin' and s.slug = 'relatorios' and s.ativo = true))
  );

alter policy permissoes_funcoes_write_admin on gestao_relatorio.permissoes_funcoes
  using (
    exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin')
  )
  with check (
    exists (select 1 from public.colaboradores c
      where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin')
  );
