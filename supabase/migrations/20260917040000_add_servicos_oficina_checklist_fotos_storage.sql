-- Bucket para fotos do veiculo tiradas durante o checklist de Oficina (mesmo
-- molde de comprovantes-pagamento: bucket privado, acesso so via signed URL
-- emitida pela edge function servicos-oficina-api). Policy usa
-- servicos_oficina_pode_ver()/pode_editar() (papel no modulo 'oficina'),
-- nao so "tem acesso ao sistema servicos" -- mesmo criterio das tabelas
-- checklist_* (20260917020000).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('oficina-checklist-fotos', 'oficina-checklist-fotos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_oficina_checklist_fotos_read" on storage.objects;
create policy "storage_oficina_checklist_fotos_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'oficina-checklist-fotos' and public.servicos_oficina_pode_ver());

drop policy if exists "storage_oficina_checklist_fotos_insert" on storage.objects;
create policy "storage_oficina_checklist_fotos_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'oficina-checklist-fotos' and public.servicos_oficina_pode_editar());

drop policy if exists "storage_oficina_checklist_fotos_update" on storage.objects;
create policy "storage_oficina_checklist_fotos_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'oficina-checklist-fotos' and public.servicos_oficina_pode_editar())
with check (bucket_id = 'oficina-checklist-fotos' and public.servicos_oficina_pode_editar());

drop policy if exists "storage_oficina_checklist_fotos_delete" on storage.objects;
create policy "storage_oficina_checklist_fotos_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'oficina-checklist-fotos' and public.servicos_oficina_pode_editar());
