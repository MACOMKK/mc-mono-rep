create table if not exists gestao_crm.versoes_veiculo (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references gestao_crm.modelos_veiculo(id),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (modelo_id, nome)
);

drop trigger if exists trg_crm_versoes_veiculo_set_updated_at on gestao_crm.versoes_veiculo;
create trigger trg_crm_versoes_veiculo_set_updated_at
before update on gestao_crm.versoes_veiculo
for each row execute function public.set_updated_at();

alter table gestao_crm.versoes_veiculo enable row level security;

drop policy if exists "crm_versoes_veiculo_select" on gestao_crm.versoes_veiculo;
create policy "crm_versoes_veiculo_select" on gestao_crm.versoes_veiculo
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_versoes_veiculo_insert" on gestao_crm.versoes_veiculo;
create policy "crm_versoes_veiculo_insert" on gestao_crm.versoes_veiculo
for insert to authenticated
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_versoes_veiculo_update" on gestao_crm.versoes_veiculo;
create policy "crm_versoes_veiculo_update" on gestao_crm.versoes_veiculo
for update to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_versoes_veiculo_delete" on gestao_crm.versoes_veiculo;
create policy "crm_versoes_veiculo_delete" on gestao_crm.versoes_veiculo
for delete to authenticated
using (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.versoes_veiculo to authenticated, service_role;

alter table gestao_crm.versoes_veiculo replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'versoes_veiculo'
  ) then
    alter publication supabase_realtime add table gestao_crm.versoes_veiculo;
  end if;
end
$$;

create index if not exists idx_crm_versoes_veiculo_modelo_id
  on gestao_crm.versoes_veiculo (modelo_id);

alter table gestao_crm.veiculos_interesse
  add column if not exists versao_id uuid references gestao_crm.versoes_veiculo(id),
  add column if not exists versao_outro text;

notify pgrst, 'reload schema';
