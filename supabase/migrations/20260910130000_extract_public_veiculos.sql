-- Extrai o veiculo fisico (chassi/placa/cor/km + catalogo modelo/versao) de
-- gestao_crm.veiculos_estoque para uma entidade central em public.veiculos,
-- reaproveitavel por outros apps (ex.: futuro modulo Oficina do app servicos)
-- sem duplicar o dado. gestao_crm.veiculos_estoque passa a ser so a extensao
-- comercial (condicao/status/preco/observacoes) ligada por veiculo_id.
--
-- gestao_crm.veiculos_estoque ja estava em producao (aplicada em
-- 20260910120000) com ate 1 linha por chassi (chassi e unique), entao o
-- backfill por chassi e seguro.

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

-- Backfill: 1 public.veiculos por linha existente de veiculos_estoque
-- (chassi unique garante 1:1).
insert into public.veiculos (modelo_id, versao_id, modelo_outro, versao_outro, chassi, placa, cor, km)
select modelo_id, versao_id, modelo_outro, versao_outro, chassi, placa, cor, km
from gestao_crm.veiculos_estoque
on conflict (chassi) do nothing;

alter table gestao_crm.veiculos_estoque
  add column if not exists veiculo_id uuid references public.veiculos(id);

update gestao_crm.veiculos_estoque ve
set veiculo_id = v.id
from public.veiculos v
where v.chassi = ve.chassi
  and ve.veiculo_id is null;

alter table gestao_crm.veiculos_estoque
  alter column veiculo_id set not null;

alter table gestao_crm.veiculos_estoque
  add constraint veiculos_estoque_veiculo_id_key unique (veiculo_id);

alter table gestao_crm.veiculos_estoque
  drop column if exists modelo_id,
  drop column if exists versao_id,
  drop column if exists modelo_outro,
  drop column if exists versao_outro,
  drop column if exists chassi,
  drop column if exists placa,
  drop column if exists cor,
  drop column if exists ano,
  drop column if exists km;

create index if not exists idx_crm_veiculos_estoque_veiculo_id
  on gestao_crm.veiculos_estoque (veiculo_id);

notify pgrst, 'reload schema';
