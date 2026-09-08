-- Corrige auth_rls_initplan (advisor de performance) nas policies dos schemas public e storage:
-- troca auth.uid() por (select auth.uid()) para o Postgres avaliar uma vez por query em vez de
-- uma vez por linha. Mesma condicao, mesmo resultado de autorizacao -- so otimizacao.
-- is_intranet_admin() e' funcao a parte, nao mexida aqui. Ver
-- SUPABASE_PERFORMANCE_INVESTIGACAO.md, item A (lote 5/5, public + storage).

alter policy acessos_read_self_or_admin on public.acessos_usuario_sistema
  using (colaborador_id = (select auth.uid()) or is_intranet_admin());

alter policy storage_assinaturas_delete_own_profile on storage.objects
  using (
    bucket_id = 'assinaturas'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_assinaturas_insert_own_profile on storage.objects
  with check (
    bucket_id = 'assinaturas'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_assinaturas_update_own_profile on storage.objects
  using (
    bucket_id = 'assinaturas'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'assinaturas'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_avatars_delete_own_profile on storage.objects
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_avatars_insert_own_profile on storage.objects
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

alter policy storage_avatars_update_own_profile on storage.objects
  using (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatares'
    and (storage.foldername(name))[1] = 'colaboradores'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
