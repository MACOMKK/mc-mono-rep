-- Corrige multiple_permissive_policies (advisor de performance) - Tier 2, Lote 1
-- (gestao_intranet, 8 tabelas). Padrao: a policy "_manage" (FOR ALL) usa uma condicao
-- (intranet_can_edit_module / intranet_is_admin) que e' SUBCONJUNTO da condicao da "_select"
-- (intranet_can_view_module / intranet_is_admin OR dono do registro) - ou seja, quem edita
-- sempre pode ver, mas nem todo mundo que ve pode editar. Hoje o Postgres avalia as DUAS
-- condicoes em todo SELECT (redundante). Fix: reduzir o escopo da "_manage" de FOR ALL para
-- so INSERT, UPDATE e DELETE, deixando a "_select" como unica dona de SELECT.
--
-- IMPORTANTE: uma unica CREATE POLICY so aceita UM comando (ALL/SELECT/INSERT/UPDATE/DELETE),
-- diferente de GRANT. Por isso cada "_manage" vira 3 policies (_insert/_update/_delete), todas
-- com a MESMA condicao (qual/with_check) que a "_manage" original tinha - so o comando muda,
-- a regra de negocio nao.
--
-- Verificacao de seguranca antes de aplicar (2026-09-06): confirmado via leitura das
-- definicoes de intranet_can_edit_module/intranet_can_view_module/intranet_is_admin/
-- intranet_has_access/intranet_module_permission que can_edit_module(X) implica
-- can_view_module(X) para todos os modulos usados aqui (avisos, conhecimento, documentos,
-- calendario, links, colaboradores) - tanto no caminho admin quanto no caminho
-- usuario-com-permissao-edit. Nao existe caso de "edita mas nao ve". Para
-- permissoes_usuario, a mesma garantia vale via intranet_is_admin() diretamente.
-- Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 2.
--
-- Definicoes originais das policies "_manage" (para rollback, caso necessario -
-- basta dropar as 3 policies novas de cada tabela e recriar isto, com FOR ALL):
--
-- create policy intranet_avisos_manage on gestao_intranet.avisos
--   for all to authenticated
--   using (intranet_can_edit_module('avisos'))
--   with check (intranet_can_edit_module('avisos'));
--
-- create policy intranet_base_conhecimento_manage on gestao_intranet.base_conhecimento
--   for all to authenticated
--   using (intranet_can_edit_module('conhecimento'))
--   with check (intranet_can_edit_module('conhecimento'));
--
-- create policy intranet_documentos_manage on gestao_intranet.documentos
--   for all to authenticated
--   using (intranet_can_edit_module('documentos'))
--   with check (intranet_can_edit_module('documentos'));
--
-- create policy intranet_eventos_calendario_manage on gestao_intranet.eventos_calendario
--   for all to authenticated
--   using (intranet_can_edit_module('calendario'))
--   with check (intranet_can_edit_module('calendario'));
--
-- create policy intranet_eventos_calendario_participantes_manage on gestao_intranet.eventos_calendario_participantes
--   for all
--   using (intranet_can_edit_module('calendario'))
--   with check (intranet_can_edit_module('calendario'));
--
-- create policy intranet_links_uteis_manage on gestao_intranet.links_uteis
--   for all to authenticated
--   using (intranet_can_edit_module('links'))
--   with check (intranet_can_edit_module('links'));
--
-- create policy intranet_perfis_colaboradores_manage on gestao_intranet.perfis_colaboradores
--   for all to authenticated
--   using (intranet_can_edit_module('colaboradores'))
--   with check (intranet_can_edit_module('colaboradores'));
--
-- create policy intranet_permissoes_usuario_manage on gestao_intranet.permissoes_usuario
--   for all to authenticated
--   using (intranet_is_admin())
--   with check (intranet_is_admin());

-- avisos
drop policy intranet_avisos_manage on gestao_intranet.avisos;
create policy intranet_avisos_manage_insert on gestao_intranet.avisos
  for insert to authenticated with check (intranet_can_edit_module('avisos'));
create policy intranet_avisos_manage_update on gestao_intranet.avisos
  for update to authenticated using (intranet_can_edit_module('avisos')) with check (intranet_can_edit_module('avisos'));
create policy intranet_avisos_manage_delete on gestao_intranet.avisos
  for delete to authenticated using (intranet_can_edit_module('avisos'));

-- base_conhecimento
drop policy intranet_base_conhecimento_manage on gestao_intranet.base_conhecimento;
create policy intranet_base_conhecimento_manage_insert on gestao_intranet.base_conhecimento
  for insert to authenticated with check (intranet_can_edit_module('conhecimento'));
create policy intranet_base_conhecimento_manage_update on gestao_intranet.base_conhecimento
  for update to authenticated using (intranet_can_edit_module('conhecimento')) with check (intranet_can_edit_module('conhecimento'));
create policy intranet_base_conhecimento_manage_delete on gestao_intranet.base_conhecimento
  for delete to authenticated using (intranet_can_edit_module('conhecimento'));

-- documentos
drop policy intranet_documentos_manage on gestao_intranet.documentos;
create policy intranet_documentos_manage_insert on gestao_intranet.documentos
  for insert to authenticated with check (intranet_can_edit_module('documentos'));
create policy intranet_documentos_manage_update on gestao_intranet.documentos
  for update to authenticated using (intranet_can_edit_module('documentos')) with check (intranet_can_edit_module('documentos'));
create policy intranet_documentos_manage_delete on gestao_intranet.documentos
  for delete to authenticated using (intranet_can_edit_module('documentos'));

-- eventos_calendario
drop policy intranet_eventos_calendario_manage on gestao_intranet.eventos_calendario;
create policy intranet_eventos_calendario_manage_insert on gestao_intranet.eventos_calendario
  for insert to authenticated with check (intranet_can_edit_module('calendario'));
create policy intranet_eventos_calendario_manage_update on gestao_intranet.eventos_calendario
  for update to authenticated using (intranet_can_edit_module('calendario')) with check (intranet_can_edit_module('calendario'));
create policy intranet_eventos_calendario_manage_delete on gestao_intranet.eventos_calendario
  for delete to authenticated using (intranet_can_edit_module('calendario'));

-- eventos_calendario_participantes (roles = public no original, sem "to")
drop policy intranet_eventos_calendario_participantes_manage on gestao_intranet.eventos_calendario_participantes;
create policy intranet_eventos_calendario_participantes_manage_insert on gestao_intranet.eventos_calendario_participantes
  for insert with check (intranet_can_edit_module('calendario'));
create policy intranet_eventos_calendario_participantes_manage_update on gestao_intranet.eventos_calendario_participantes
  for update using (intranet_can_edit_module('calendario')) with check (intranet_can_edit_module('calendario'));
create policy intranet_eventos_calendario_participantes_manage_delete on gestao_intranet.eventos_calendario_participantes
  for delete using (intranet_can_edit_module('calendario'));

-- links_uteis
drop policy intranet_links_uteis_manage on gestao_intranet.links_uteis;
create policy intranet_links_uteis_manage_insert on gestao_intranet.links_uteis
  for insert to authenticated with check (intranet_can_edit_module('links'));
create policy intranet_links_uteis_manage_update on gestao_intranet.links_uteis
  for update to authenticated using (intranet_can_edit_module('links')) with check (intranet_can_edit_module('links'));
create policy intranet_links_uteis_manage_delete on gestao_intranet.links_uteis
  for delete to authenticated using (intranet_can_edit_module('links'));

-- perfis_colaboradores
drop policy intranet_perfis_colaboradores_manage on gestao_intranet.perfis_colaboradores;
create policy intranet_perfis_colaboradores_manage_insert on gestao_intranet.perfis_colaboradores
  for insert to authenticated with check (intranet_can_edit_module('colaboradores'));
create policy intranet_perfis_colaboradores_manage_update on gestao_intranet.perfis_colaboradores
  for update to authenticated using (intranet_can_edit_module('colaboradores')) with check (intranet_can_edit_module('colaboradores'));
create policy intranet_perfis_colaboradores_manage_delete on gestao_intranet.perfis_colaboradores
  for delete to authenticated using (intranet_can_edit_module('colaboradores'));

-- permissoes_usuario
drop policy intranet_permissoes_usuario_manage on gestao_intranet.permissoes_usuario;
create policy intranet_permissoes_usuario_manage_insert on gestao_intranet.permissoes_usuario
  for insert to authenticated with check (intranet_is_admin());
create policy intranet_permissoes_usuario_manage_update on gestao_intranet.permissoes_usuario
  for update to authenticated using (intranet_is_admin()) with check (intranet_is_admin());
create policy intranet_permissoes_usuario_manage_delete on gestao_intranet.permissoes_usuario
  for delete to authenticated using (intranet_is_admin());
