create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references gestao_crm.modelos_veiculo(id),
  versao_id uuid references gestao_crm.versoes_veiculo(id),
  modelo_outro text,
  versao_outro text,
  chassi text not null unique,
  placa text,
  cor text,
  km integer,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_veiculos_set_updated_at on public.veiculos;
create trigger trg_veiculos_set_updated_at
before update on public.veiculos
for each row execute function public.set_updated_at();

alter table public.veiculos enable row level security;

drop policy if exists "veiculos_select" on public.veiculos;
create policy "veiculos_select" on public.veiculos
for select to authenticated using (public.crm_has_access());

drop policy if exists "veiculos_insert" on public.veiculos;
create policy "veiculos_insert" on public.veiculos
for insert to authenticated
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "veiculos_update" on public.veiculos;
create policy "veiculos_update" on public.veiculos
for update to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "veiculos_delete" on public.veiculos;
create policy "veiculos_delete" on public.veiculos
for delete to authenticated
using (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on public.veiculos to authenticated, service_role;

alter table public.veiculos replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'veiculos'
  ) then
    alter publication supabase_realtime add table public.veiculos;
  end if;
end
$$;

create index if not exists idx_veiculos_modelo_id
  on public.veiculos (modelo_id);
create index if not exists idx_veiculos_versao_id
  on public.veiculos (versao_id);

create table if not exists gestao_crm.veiculos_estoque (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null unique references public.veiculos(id),
  condicao text not null default 'novo'
    check (condicao in ('novo', 'seminovo', 'usado')),
  status text not null default 'disponivel'
    check (status in ('disponivel', 'reservado', 'vendido')),
  preco numeric(12, 2),
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_crm_veiculos_estoque_set_updated_at on gestao_crm.veiculos_estoque;
create trigger trg_crm_veiculos_estoque_set_updated_at
before update on gestao_crm.veiculos_estoque
for each row execute function public.set_updated_at();

alter table gestao_crm.veiculos_estoque enable row level security;

drop policy if exists "crm_veiculos_estoque_select" on gestao_crm.veiculos_estoque;
create policy "crm_veiculos_estoque_select" on gestao_crm.veiculos_estoque
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_veiculos_estoque_insert" on gestao_crm.veiculos_estoque;
create policy "crm_veiculos_estoque_insert" on gestao_crm.veiculos_estoque
for insert to authenticated
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_veiculos_estoque_update" on gestao_crm.veiculos_estoque;
create policy "crm_veiculos_estoque_update" on gestao_crm.veiculos_estoque
for update to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_veiculos_estoque_delete" on gestao_crm.veiculos_estoque;
create policy "crm_veiculos_estoque_delete" on gestao_crm.veiculos_estoque
for delete to authenticated
using (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.veiculos_estoque to authenticated, service_role;

alter table gestao_crm.veiculos_estoque replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'veiculos_estoque'
  ) then
    alter publication supabase_realtime add table gestao_crm.veiculos_estoque;
  end if;
end
$$;

create index if not exists idx_crm_veiculos_estoque_veiculo_id
  on gestao_crm.veiculos_estoque (veiculo_id);
create index if not exists idx_crm_veiculos_estoque_status
  on gestao_crm.veiculos_estoque (status);

notify pgrst, 'reload schema';
