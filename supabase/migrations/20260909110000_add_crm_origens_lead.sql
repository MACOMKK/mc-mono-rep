create table if not exists gestao_crm.origens_lead (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_crm_origens_lead_set_updated_at on gestao_crm.origens_lead;
create trigger trg_crm_origens_lead_set_updated_at
before update on gestao_crm.origens_lead
for each row execute function public.set_updated_at();

alter table gestao_crm.origens_lead enable row level security;

drop policy if exists "crm_origens_lead_select" on gestao_crm.origens_lead;
create policy "crm_origens_lead_select" on gestao_crm.origens_lead
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_origens_lead_manage" on gestao_crm.origens_lead;
create policy "crm_origens_lead_manage" on gestao_crm.origens_lead
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.origens_lead to authenticated, service_role;

insert into gestao_crm.origens_lead (nome) values
  ('Telefone'), ('WhatsApp'), ('Site'), ('Showroom'), ('Indicação')
on conflict (nome) do nothing;

alter table gestao_crm.origens_lead replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'origens_lead'
  ) then
    alter publication supabase_realtime add table gestao_crm.origens_lead;
  end if;
end
$$;

alter table gestao_crm.leads
  add column if not exists origem_id uuid references gestao_crm.origens_lead(id);

update gestao_crm.leads l
set origem_id = (
  select o.id
  from gestao_crm.origens_lead o
  where lower(o.nome) = case lower(l.origem)
    when 'telefone' then 'telefone'
    when 'whatsapp' then 'whatsapp'
    when 'site' then 'site'
    when 'showroom' then 'showroom'
    when 'indicacao' then 'indicação'
    else lower(l.origem)
  end
)
where l.origem_id is null;

update gestao_crm.leads
set origem_id = (select id from gestao_crm.origens_lead where nome = 'Site')
where origem_id is null;

alter table gestao_crm.leads alter column origem_id set not null;

alter table gestao_crm.leads drop constraint if exists leads_origem_check;
alter table gestao_crm.leads drop column if exists origem;

drop index if exists gestao_crm.idx_crm_leads_origem;
create index if not exists idx_crm_leads_origem_id
  on gestao_crm.leads (origem_id);

notify pgrst, 'reload schema';
