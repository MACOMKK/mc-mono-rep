-- Corrige multiple_permissive_policies (advisor de performance) - Tier 2, Lote 2
-- (gestao_ativos, gestao_comunicacao, gestao_crm - 7 tabelas). Mesmo padrao do Lote 1:
-- a policy "_manage"/"_write" (FOR ALL) usa uma condicao que e' SUBCONJUNTO da condicao
-- da "_select" correspondente - quem edita sempre pode ver, mas nem todo mundo que ve
-- pode editar. Hoje o Postgres avalia as DUAS condicoes em todo SELECT (redundante).
-- Fix: reduzir o escopo da "_manage"/"_write" de FOR ALL para so INSERT, UPDATE e DELETE,
-- deixando a "_select" como unica dona de SELECT.
--
-- IMPORTANTE: uma unica CREATE POLICY so aceita UM comando (ALL/SELECT/INSERT/UPDATE/DELETE),
-- diferente de GRANT. Por isso cada "_manage"/"_write" vira 3 policies (_insert/_update/_delete),
-- todas com a MESMA condicao (qual/with_check) que a original tinha - so o comando muda,
-- a regra de negocio nao.
--
-- Verificacao de seguranca antes de aplicar (2026-09-06), lendo pg_policies + pg_get_functiondef:
-- - contratos_documentos: central_module_access(X,'gerenciar') implica central_module_access(X,'ver')
--   (a propria funcao trata 'gerenciar' como dentro do conjunto aceito por 'ver').
-- - permissoes_central / permissoes_central_nivel: write exige funcao/nivel_acesso = 'admin';
--   select aceita funcao/nivel_acesso IN ('admin','gestor') - subconjunto trivial (inline SQL).
-- - canais: comunicacao_is_admin() (nivel = 'admin') implica comunicacao_has_access()
--   (nivel IN ('admin','gestor','usuario')).
-- - categorias_veiculo: crm_access_level() IN ('admin','gestor') implica crm_has_access()
--   (nivel IN ('admin','gestor','usuario')).
-- - configuracoes_distribuicao / vendedores_distribuicao: manage = admin OR (gestor AND
--   unidade_id = unidade atual); select = admin OR unidade_id = unidade atual. O branch
--   gestor de manage ja satisfaz a condicao nao-admin de select.
-- Nao existe caso de "edita mas nao ve" em nenhuma das 7 tabelas.
-- Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 2.
--
-- Definicoes originais das policies "_manage"/"_write" (para rollback, caso necessario -
-- basta dropar as 3 policies novas de cada tabela e recriar isto, com FOR ALL):
--
-- create policy contratos_documentos_manage_central on gestao_ativos.contratos_documentos
--   for all
--   using (central_module_access('contratos_documentos', 'gerenciar'))
--   with check (central_module_access('contratos_documentos', 'gerenciar'));
--
-- create policy permissoes_central_write_admin on gestao_ativos.permissoes_central
--   for all to authenticated
--   using (
--     (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
--     or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
--         where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
--           and s.slug = 'central' and s.ativo = true))
--   )
--   with check (
--     (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
--     or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
--         where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
--           and s.slug = 'central' and s.ativo = true))
--   );
--
-- create policy permissoes_central_nivel_write on gestao_ativos.permissoes_central_nivel
--   for all to authenticated
--   using (
--     (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
--     or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
--         where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
--           and s.slug = 'central' and s.ativo = true))
--   )
--   with check (
--     (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
--     or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
--         where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
--           and s.slug = 'central' and s.ativo = true))
--   );
--
-- create policy comunicacao_canais_manage on gestao_comunicacao.canais
--   for all to authenticated
--   using (comunicacao_is_admin())
--   with check (comunicacao_is_admin());
--
-- create policy crm_categorias_veiculo_manage on gestao_crm.categorias_veiculo
--   for all to authenticated
--   using (crm_access_level() = any (array['admin','gestor']))
--   with check (crm_access_level() = any (array['admin','gestor']));
--
-- create policy crm_distribuicao_manage on gestao_crm.configuracoes_distribuicao
--   for all to authenticated
--   using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()))
--   with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
--
-- create policy crm_vendedores_distribuicao_manage on gestao_crm.vendedores_distribuicao
--   for all to authenticated
--   using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()))
--   with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));

-- gestao_ativos.contratos_documentos (roles = public no original, sem "to")
drop policy contratos_documentos_manage_central on gestao_ativos.contratos_documentos;
create policy contratos_documentos_manage_central_insert on gestao_ativos.contratos_documentos
  for insert with check (central_module_access('contratos_documentos', 'gerenciar'));
create policy contratos_documentos_manage_central_update on gestao_ativos.contratos_documentos
  for update using (central_module_access('contratos_documentos', 'gerenciar')) with check (central_module_access('contratos_documentos', 'gerenciar'));
create policy contratos_documentos_manage_central_delete on gestao_ativos.contratos_documentos
  for delete using (central_module_access('contratos_documentos', 'gerenciar'));

-- gestao_ativos.permissoes_central
drop policy permissoes_central_write_admin on gestao_ativos.permissoes_central;
create policy permissoes_central_write_admin_insert on gestao_ativos.permissoes_central
  for insert to authenticated with check (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );
create policy permissoes_central_write_admin_update on gestao_ativos.permissoes_central
  for update to authenticated using (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  ) with check (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );
create policy permissoes_central_write_admin_delete on gestao_ativos.permissoes_central
  for delete to authenticated using (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );

-- gestao_ativos.permissoes_central_nivel
drop policy permissoes_central_nivel_write on gestao_ativos.permissoes_central_nivel;
create policy permissoes_central_nivel_write_insert on gestao_ativos.permissoes_central_nivel
  for insert to authenticated with check (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );
create policy permissoes_central_nivel_write_update on gestao_ativos.permissoes_central_nivel
  for update to authenticated using (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  ) with check (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );
create policy permissoes_central_nivel_write_delete on gestao_ativos.permissoes_central_nivel
  for delete to authenticated using (
    (exists (select 1 from colaboradores c where c.id = (select auth.uid()) and c.status <> 'inativo' and c.funcao = 'admin'))
    or (exists (select 1 from acessos_usuario_sistema aus join sistemas s on s.id = aus.sistema_id
        where aus.colaborador_id = (select auth.uid()) and aus.ativo = true and aus.nivel_acesso = 'admin'
          and s.slug = 'central' and s.ativo = true))
  );

-- gestao_comunicacao.canais
drop policy comunicacao_canais_manage on gestao_comunicacao.canais;
create policy comunicacao_canais_manage_insert on gestao_comunicacao.canais
  for insert to authenticated with check (comunicacao_is_admin());
create policy comunicacao_canais_manage_update on gestao_comunicacao.canais
  for update to authenticated using (comunicacao_is_admin()) with check (comunicacao_is_admin());
create policy comunicacao_canais_manage_delete on gestao_comunicacao.canais
  for delete to authenticated using (comunicacao_is_admin());

-- gestao_crm.categorias_veiculo
drop policy crm_categorias_veiculo_manage on gestao_crm.categorias_veiculo;
create policy crm_categorias_veiculo_manage_insert on gestao_crm.categorias_veiculo
  for insert to authenticated with check (crm_access_level() = any (array['admin','gestor']));
create policy crm_categorias_veiculo_manage_update on gestao_crm.categorias_veiculo
  for update to authenticated using (crm_access_level() = any (array['admin','gestor'])) with check (crm_access_level() = any (array['admin','gestor']));
create policy crm_categorias_veiculo_manage_delete on gestao_crm.categorias_veiculo
  for delete to authenticated using (crm_access_level() = any (array['admin','gestor']));

-- gestao_crm.configuracoes_distribuicao
drop policy crm_distribuicao_manage on gestao_crm.configuracoes_distribuicao;
create policy crm_distribuicao_manage_insert on gestao_crm.configuracoes_distribuicao
  for insert to authenticated with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
create policy crm_distribuicao_manage_update on gestao_crm.configuracoes_distribuicao
  for update to authenticated using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id())) with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
create policy crm_distribuicao_manage_delete on gestao_crm.configuracoes_distribuicao
  for delete to authenticated using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));

-- gestao_crm.vendedores_distribuicao
drop policy crm_vendedores_distribuicao_manage on gestao_crm.vendedores_distribuicao;
create policy crm_vendedores_distribuicao_manage_insert on gestao_crm.vendedores_distribuicao
  for insert to authenticated with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
create policy crm_vendedores_distribuicao_manage_update on gestao_crm.vendedores_distribuicao
  for update to authenticated using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id())) with check (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
create policy crm_vendedores_distribuicao_manage_delete on gestao_crm.vendedores_distribuicao
  for delete to authenticated using (crm_access_level() = 'admin' or (crm_access_level() = 'gestor' and unidade_id = crm_current_unidade_id()));
