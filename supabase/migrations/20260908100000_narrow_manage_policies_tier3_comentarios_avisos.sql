-- Corrige multiple_permissive_policies (advisor de performance) - Tier 3, caso 1
-- (gestao_intranet.comentarios_avisos).
--
-- Diferente do Tier 2 (lotes 1-3, onde a policy "_manage"/"_write" FOR ALL era
-- subconjunto estrito da "_select"), aqui a policy FOR ALL
-- "intranet_comentarios_avisos_update_delete" (admin OU dono) NAO e' subconjunto
-- nem superconjunto das outras duas - exige fusao booleana, verificada abaixo.
--
-- Estado original (3 policies, verificado via pg_policies em 2026-09-08):
--
-- create policy "intranet_comentarios_avisos_select" on gestao_intranet.comentarios_avisos
--   for select to authenticated
--   using (public.intranet_can_view_module('avisos'));
--
-- create policy "intranet_comentarios_avisos_insert" on gestao_intranet.comentarios_avisos
--   for insert to authenticated
--   with check (
--     public.intranet_can_view_module('avisos')
--     and criado_por = public.current_colaborador_id()
--   );
--
-- create policy "intranet_comentarios_avisos_update_delete" on gestao_intranet.comentarios_avisos
--   for all to authenticated
--   using (public.intranet_is_admin() or criado_por = public.current_colaborador_id())
--   with check (public.intranet_is_admin() or criado_por = public.current_colaborador_id());
--
-- Como a policy 3 e' FOR ALL, ela tambem participa da avaliacao de SELECT e INSERT,
-- junto com as policies 1 e 2 (isso e' o que o advisor acusa como duplicidade).
--
-- Prova de que a fusao abaixo NAO muda nenhum comportamento:
--
-- SELECT hoje = can_view_module('avisos') OR (is_admin() OR dono)
--   -> 3 termos genuinamente distintos (um dono pode, em tese, ter perdido acesso
--      de visualizacao do modulo depois de comentar). Fusao: OR dos 3 termos numa
--      unica policy - identico ao efetivo atual, so consolidado.
--
-- INSERT hoje = (can_view_module('avisos') AND dono) OR (is_admin() OR dono)
--   -> por lei de absorcao, "(A AND B) OR B = B" (aqui B = dono): o termo
--      "can_view_module" ja e' redundante HOJE, por causa do OR vindo da policy
--      FOR ALL. O efetivo atual ja e', simplificado, "dono OR is_admin()".
--      Fusao: policy unica de INSERT com "is_admin() OR dono" - preserva
--      exatamente o comportamento atual (inclusive esse efeito colateral
--      pre-existente, que independe desta migration).
--
-- UPDATE/DELETE: so a policy 3 ja se aplicava (sem sobreposicao) - so separa em
-- comandos dedicados, igual ao padrao mecanico do Tier 2.
--
-- Blast radius: o CRUD real de comentarios passa pela Edge Function intranet-api,
-- que conecta direto no Postgres via DATABASE_URL (sem FORCE ROW LEVEL SECURITY) -
-- ou seja, estas policies NAO gatekeepam o CRUD hoje (autorizacao real em JS,
-- assertModuleView/assertModuleEdit). O unico caminho onde este RLS importa de
-- fato e' o Realtime (postgres_changes, usado por useIntranetRealtime.js no app
-- intranet), que autentica com o JWT do usuario e avalia as policies de SELECT.
-- Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 3.

drop policy "intranet_comentarios_avisos_select" on gestao_intranet.comentarios_avisos;
drop policy "intranet_comentarios_avisos_insert" on gestao_intranet.comentarios_avisos;
drop policy "intranet_comentarios_avisos_update_delete" on gestao_intranet.comentarios_avisos;

create policy "intranet_comentarios_avisos_select" on gestao_intranet.comentarios_avisos
  for select to authenticated
  using (
    public.intranet_can_view_module('avisos')
    or public.intranet_is_admin()
    or criado_por = public.current_colaborador_id()
  );

create policy "intranet_comentarios_avisos_insert" on gestao_intranet.comentarios_avisos
  for insert to authenticated
  with check (
    public.intranet_is_admin()
    or criado_por = public.current_colaborador_id()
  );

create policy "intranet_comentarios_avisos_update" on gestao_intranet.comentarios_avisos
  for update to authenticated
  using (
    public.intranet_is_admin()
    or criado_por = public.current_colaborador_id()
  )
  with check (
    public.intranet_is_admin()
    or criado_por = public.current_colaborador_id()
  );

create policy "intranet_comentarios_avisos_delete" on gestao_intranet.comentarios_avisos
  for delete to authenticated
  using (
    public.intranet_is_admin()
    or criado_por = public.current_colaborador_id()
  );
