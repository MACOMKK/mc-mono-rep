alter table gestao_crm.categorias_veiculo
  add column if not exists campos_extra jsonb not null default '[]';

create table if not exists gestao_crm.marcas_veiculo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists gestao_crm.modelos_veiculo (
  id uuid primary key default gen_random_uuid(),
  marca_id uuid not null references gestao_crm.marcas_veiculo(id),
  categoria_veiculo_id uuid not null references gestao_crm.categorias_veiculo(id),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (marca_id, categoria_veiculo_id, nome)
);

drop trigger if exists trg_crm_marcas_veiculo_set_updated_at on gestao_crm.marcas_veiculo;
create trigger trg_crm_marcas_veiculo_set_updated_at
before update on gestao_crm.marcas_veiculo
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_modelos_veiculo_set_updated_at on gestao_crm.modelos_veiculo;
create trigger trg_crm_modelos_veiculo_set_updated_at
before update on gestao_crm.modelos_veiculo
for each row execute function public.set_updated_at();

alter table gestao_crm.marcas_veiculo enable row level security;
alter table gestao_crm.modelos_veiculo enable row level security;

drop policy if exists "crm_marcas_veiculo_select" on gestao_crm.marcas_veiculo;
create policy "crm_marcas_veiculo_select" on gestao_crm.marcas_veiculo
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_marcas_veiculo_insert" on gestao_crm.marcas_veiculo;
create policy "crm_marcas_veiculo_insert" on gestao_crm.marcas_veiculo
for insert to authenticated
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_marcas_veiculo_update" on gestao_crm.marcas_veiculo;
create policy "crm_marcas_veiculo_update" on gestao_crm.marcas_veiculo
for update to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_marcas_veiculo_delete" on gestao_crm.marcas_veiculo;
create policy "crm_marcas_veiculo_delete" on gestao_crm.marcas_veiculo
for delete to authenticated
using (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_modelos_veiculo_select" on gestao_crm.modelos_veiculo;
create policy "crm_modelos_veiculo_select" on gestao_crm.modelos_veiculo
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_modelos_veiculo_insert" on gestao_crm.modelos_veiculo;
create policy "crm_modelos_veiculo_insert" on gestao_crm.modelos_veiculo
for insert to authenticated
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_modelos_veiculo_update" on gestao_crm.modelos_veiculo;
create policy "crm_modelos_veiculo_update" on gestao_crm.modelos_veiculo
for update to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_modelos_veiculo_delete" on gestao_crm.modelos_veiculo;
create policy "crm_modelos_veiculo_delete" on gestao_crm.modelos_veiculo
for delete to authenticated
using (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.marcas_veiculo to authenticated, service_role;
grant select, insert, update, delete on gestao_crm.modelos_veiculo to authenticated, service_role;

alter table gestao_crm.marcas_veiculo replica identity full;
alter table gestao_crm.modelos_veiculo replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'marcas_veiculo'
  ) then
    alter publication supabase_realtime add table gestao_crm.marcas_veiculo;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'modelos_veiculo'
  ) then
    alter publication supabase_realtime add table gestao_crm.modelos_veiculo;
  end if;
end
$$;

create index if not exists idx_crm_modelos_veiculo_marca_id
  on gestao_crm.modelos_veiculo (marca_id);
create index if not exists idx_crm_modelos_veiculo_categoria_veiculo_id
  on gestao_crm.modelos_veiculo (categoria_veiculo_id);

notify pgrst, 'reload schema';
