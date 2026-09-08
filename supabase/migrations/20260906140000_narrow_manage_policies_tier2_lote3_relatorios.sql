-- Corrige multiple_permissive_policies (advisor de performance) - Tier 2, Lote 3
-- (gestao_relatorio, schema do app relatorios).
--
-- Padrao identico aos Lotes 1 (intranet) e 2 (ativos/comunicacao/crm): a policy
-- "_admin_manage"/"_write_admin" (FOR ALL, condicao relatorios_is_admin() ou
-- equivalente) e' SUBCONJUNTO da condicao do "_select" correspondente (que sempre
-- inclui "is_admin OR <regra adicional>"). Fix: reduzir o escopo da policy de
-- FOR ALL para INSERT/UPDATE/DELETE, deixando o "_select" como unica dona do SELECT.
--
-- Verificacao de seguranca (2026-09-06): confirmado via leitura de pg_policies e
-- pg_get_functiondef que relatorios_is_admin() e current_colaborador_id() sao
-- STABLE SECURITY DEFINER (sem dependencia de dados da linha), e que, para cada
-- tabela abaixo, a condicao "admin" e' estritamente um OR-subset da condicao do
-- select. Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 2, Lote 3.
--
-- EXCECAO: gestao_relatorio.avisos_relatorios_aceites tem 3 policies (nao 2):
--   - avisos_relatorios_aceites_admin_manage      (ALL,    is_admin)
--   - avisos_relatorios_aceites_insert_own        (INSERT, is_admin OR (dono E aviso ativo com permissao))
--   - avisos_relatorios_aceites_select_admin_or_own (SELECT, is_admin OR dono)
-- Como "is_admin" ja esta contido tanto na condicao do insert_own quanto na do
-- select_admin_or_own, a contribuicao do admin_manage para INSERT e SELECT e'
-- inteiramente redundante (nao concede nada que essas policies ja nao concedessem).
-- Por isso, ao contrario do padrao mecanico das outras tabelas, admin_manage aqui
-- so e recriado para UPDATE e DELETE (unicos comandos sem policy propria) - NAO
-- recriamos copias para INSERT/SELECT, pois isso so adicionaria policies redundantes
-- de volta (o problema que estamos corrigindo).
--
-- gestao_relatorio.logs_auditoria tem apenas 1 policy (SELECT, sem ALL/_manage) -
-- fora do escopo deste lote, nada a fazer.
--
-- Definicoes originais (para rollback, caso necessario):
--
-- create policy avisos_relatorios_admin_manage on gestao_relatorio.avisos_relatorios
--   for all to public
--   using (relatorios_is_admin())
--   with check (relatorios_is_admin());
--
-- create policy avisos_relatorios_aceites_admin_manage on gestao_relatorio.avisos_relatorios_aceites
--   for all to public
--   using (relatorios_is_admin())
--   with check (relatorios_is_admin());
--
-- create policy permissoes_funcoes_write_admin on gestao_relatorio.permissoes_funcoes
--   for all to authenticated
--   using (exists (select 1 from colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin'))
--   with check (exists (select 1 from colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin'));
--
-- create policy permissoes_relatorios_admin_manage on gestao_relatorio.permissoes_relatorios
--   for all to authenticated
--   using (relatorios_is_admin())
--   with check (relatorios_is_admin());
--
-- create policy relatorios_admin_manage on gestao_relatorio.relatorios
--   for all to authenticated
--   using (relatorios_is_admin())
--   with check (relatorios_is_admin());
--
-- create policy relatorios_unidades_admin_manage on gestao_relatorio.relatorios_unidades
--   for all to authenticated
--   using (relatorios_is_admin())
--   with check (relatorios_is_admin());

-- avisos_relatorios
drop policy avisos_relatorios_admin_manage on gestao_relatorio.avisos_relatorios;
create policy avisos_relatorios_admin_manage_insert on gestao_relatorio.avisos_relatorios
  for insert to public with check (relatorios_is_admin());
create policy avisos_relatorios_admin_manage_update on gestao_relatorio.avisos_relatorios
  for update to public using (relatorios_is_admin()) with check (relatorios_is_admin());
create policy avisos_relatorios_admin_manage_delete on gestao_relatorio.avisos_relatorios
  for delete to public using (relatorios_is_admin());

-- avisos_relatorios_aceites (excecao: so update/delete, ver nota acima)
drop policy avisos_relatorios_aceites_admin_manage on gestao_relatorio.avisos_relatorios_aceites;
create policy avisos_relatorios_aceites_admin_manage_update on gestao_relatorio.avisos_relatorios_aceites
  for update to public using (relatorios_is_admin()) with check (relatorios_is_admin());
create policy avisos_relatorios_aceites_admin_manage_delete on gestao_relatorio.avisos_relatorios_aceites
  for delete to public using (relatorios_is_admin());

-- permissoes_funcoes
drop policy permissoes_funcoes_write_admin on gestao_relatorio.permissoes_funcoes;
create policy permissoes_funcoes_write_admin_insert on gestao_relatorio.permissoes_funcoes
  for insert to authenticated with check (
    exists (select 1 from public.colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin')
  );
create policy permissoes_funcoes_write_admin_update on gestao_relatorio.permissoes_funcoes
  for update to authenticated using (
    exists (select 1 from public.colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin')
  ) with check (
    exists (select 1 from public.colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin')
  );
create policy permissoes_funcoes_write_admin_delete on gestao_relatorio.permissoes_funcoes
  for delete to authenticated using (
    exists (select 1 from public.colaboradores c where c.id = auth.uid() and c.status <> 'inativo' and c.funcao = 'admin')
  );

-- permissoes_relatorios
drop policy permissoes_relatorios_admin_manage on gestao_relatorio.permissoes_relatorios;
create policy permissoes_relatorios_admin_manage_insert on gestao_relatorio.permissoes_relatorios
  for insert to authenticated with check (relatorios_is_admin());
create policy permissoes_relatorios_admin_manage_update on gestao_relatorio.permissoes_relatorios
  for update to authenticated using (relatorios_is_admin()) with check (relatorios_is_admin());
create policy permissoes_relatorios_admin_manage_delete on gestao_relatorio.permissoes_relatorios
  for delete to authenticated using (relatorios_is_admin());

-- relatorios
drop policy relatorios_admin_manage on gestao_relatorio.relatorios;
create policy relatorios_admin_manage_insert on gestao_relatorio.relatorios
  for insert to authenticated with check (relatorios_is_admin());
create policy relatorios_admin_manage_update on gestao_relatorio.relatorios
  for update to authenticated using (relatorios_is_admin()) with check (relatorios_is_admin());
create policy relatorios_admin_manage_delete on gestao_relatorio.relatorios
  for delete to authenticated using (relatorios_is_admin());

-- relatorios_unidades
drop policy relatorios_unidades_admin_manage on gestao_relatorio.relatorios_unidades;
create policy relatorios_unidades_admin_manage_insert on gestao_relatorio.relatorios_unidades
  for insert to authenticated with check (relatorios_is_admin());
create policy relatorios_unidades_admin_manage_update on gestao_relatorio.relatorios_unidades
  for update to authenticated using (relatorios_is_admin()) with check (relatorios_is_admin());
create policy relatorios_unidades_admin_manage_delete on gestao_relatorio.relatorios_unidades
  for delete to authenticated using (relatorios_is_admin());
