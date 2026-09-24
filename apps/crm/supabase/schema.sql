create extension if not exists pgcrypto;

create schema if not exists gestao_crm;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create or replace function public.current_colaborador_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.colaboradores c
  where c.id = auth.uid()
     or lower(c.email) = lower(auth.email())
  order by case when c.id = auth.uid() then 0 else 1 end
  limit 1;
$$;

insert into public.sistemas (slug, nome, descricao, ativo)
values ('crm', 'CRM', 'Gestao comercial de leads, clientes e atendimentos', true)
on conflict (slug) do update
set
  nome = excluded.nome,
  descricao = excluded.descricao,
  ativo = excluded.ativo,
  atualizado_em = now();

create table if not exists gestao_crm.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  telefone_normalizado text not null,
  email text,
  email_normalizado text,
  empresa text not null default 'Macom Ananindeua'
    check (empresa in ('Macom Ananindeua', 'Macom Belém', 'Macom Paragominas')),
  status_relacionamento text not null default 'lead'
    check (status_relacionamento in ('lead', 'cliente', 'pos_venda')),
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.colaboradores(id) on delete set null
);

create table if not exists gestao_crm.leads (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references gestao_crm.clientes(id) on delete cascade,
  nome text not null,
  telefone text not null,
  telefone_normalizado text not null,
  email text,
  email_normalizado text,
  origem text not null default 'site'
    check (origem in ('telefone', 'whatsapp', 'site', 'showroom', 'indicacao')),
  status text not null default 'novo'
    check (status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao', 'convertido', 'perdido')),
  modelo_interesse text,
  empresa text not null default 'Macom Ananindeua'
    check (empresa in ('Macom Ananindeua', 'Macom Belém', 'Macom Paragominas')),
  convertido_em timestamptz,
  perdido_em timestamptz,
  motivo_perda text,
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  unidade_id uuid references public.unidades(id) on delete restrict,
  atribuido_em timestamptz,
  primeiro_contato_em timestamptz,
  sla_primeiro_contato_em timestamptz,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.colaboradores(id) on delete set null
);

create table if not exists gestao_crm.atendimentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references gestao_crm.leads(id) on delete cascade,
  cliente_id uuid not null references gestao_crm.clientes(id) on delete cascade,
  titulo text not null,
  status text not null default 'planejada'
    check (status in ('planejada', 'concluida', 'cancelada')),
  tipo_atendimento text not null default 'ligacao'
    check (tipo_atendimento in ('ligacao', 'whatsapp', 'email', 'visita', 'test_drive', 'tarefa', 'venda', 'pos_venda', 'agendamento', 'retorno')),
  temperatura text not null default 'morno'
    check (temperatura in ('frio', 'morno', 'quente')),
  proximo_contato date,
  observacoes text,
  resultado text
    check (resultado is null or resultado in ('contato_realizado', 'sem_resposta', 'visita_agendada', 'test_drive', 'proposta_enviada', 'venda_realizada', 'lead_perdido')),
  motivo_resultado text,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid references public.colaboradores(id) on delete set null
);

create table if not exists gestao_crm.historico_atendimentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references gestao_crm.clientes(id) on delete cascade,
  lead_id uuid references gestao_crm.leads(id) on delete set null,
  atendimento_id uuid references gestao_crm.atendimentos(id) on delete set null,
  tipo text not null
    check (tipo in ('entrada_lead', 'atendimento', 'conversao_lead', 'observacao', 'atualizacao_lead', 'atribuicao_lead')),
  descricao text not null,
  entidade text,
  entidade_id uuid,
  status text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  criado_por uuid references public.colaboradores(id) on delete set null
);

create unique index if not exists idx_crm_clientes_telefone_unique
  on gestao_crm.clientes (telefone_normalizado);

create unique index if not exists idx_crm_clientes_email_unique
  on gestao_crm.clientes (email_normalizado)
  where email_normalizado is not null and email_normalizado <> '';

create unique index if not exists idx_crm_leads_cliente_ativo_unique
  on gestao_crm.leads (cliente_id)
  where status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');

create unique index if not exists idx_crm_atendimentos_lead_planejada_unique
  on gestao_crm.atendimentos (lead_id)
  where status = 'planejada';

create index if not exists idx_crm_clientes_empresa
  on gestao_crm.clientes (empresa);

create index if not exists idx_crm_clientes_status_relacionamento
  on gestao_crm.clientes (status_relacionamento);

create index if not exists idx_crm_leads_cliente_id
  on gestao_crm.leads (cliente_id);

create index if not exists idx_crm_leads_empresa_status
  on gestao_crm.leads (empresa, status);

create index if not exists idx_crm_leads_origem
  on gestao_crm.leads (origem);

create index if not exists idx_crm_leads_responsavel_status
  on gestao_crm.leads (responsavel_id, status);

create index if not exists idx_crm_leads_unidade_status
  on gestao_crm.leads (unidade_id, status);

create index if not exists idx_crm_leads_sla_primeiro_contato
  on gestao_crm.leads (sla_primeiro_contato_em)
  where primeiro_contato_em is null and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');

create index if not exists idx_crm_atendimentos_lead_id
  on gestao_crm.atendimentos (lead_id);

create index if not exists idx_crm_atendimentos_cliente_id
  on gestao_crm.atendimentos (cliente_id);

create index if not exists idx_crm_atendimentos_status_proximo_contato
  on gestao_crm.atendimentos (status, proximo_contato);

create index if not exists idx_crm_historico_cliente_id_criado_em
  on gestao_crm.historico_atendimentos (cliente_id, criado_em desc);

create index if not exists idx_crm_historico_lead_id_criado_em
  on gestao_crm.historico_atendimentos (lead_id, criado_em desc);

drop trigger if exists trg_crm_clientes_set_updated_at on gestao_crm.clientes;
create trigger trg_crm_clientes_set_updated_at
before update on gestao_crm.clientes
for each row
execute function public.set_updated_at();

drop trigger if exists trg_crm_leads_set_updated_at on gestao_crm.leads;
create trigger trg_crm_leads_set_updated_at
before update on gestao_crm.leads
for each row
execute function public.set_updated_at();

drop trigger if exists trg_crm_atendimentos_set_updated_at on gestao_crm.atendimentos;
create trigger trg_crm_atendimentos_set_updated_at
before update on gestao_crm.atendimentos
for each row
execute function public.set_updated_at();

create or replace function public.crm_access_level()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select aus.nivel_acesso
  from public.acessos_usuario_sistema aus
  join public.sistemas s on s.id = aus.sistema_id
  where aus.colaborador_id = public.current_colaborador_id()
    and aus.ativo = true
    and s.slug = 'crm'
    and s.ativo = true
  limit 1;
$$;

create or replace function public.crm_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.crm_access_level() in ('admin', 'gestor', 'usuario'), false);
$$;

create or replace function public.crm_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.crm_access_level() in ('admin', 'gestor', 'usuario'), false);
$$;

alter table gestao_crm.clientes enable row level security;
alter table gestao_crm.leads enable row level security;
alter table gestao_crm.atendimentos enable row level security;
alter table gestao_crm.historico_atendimentos enable row level security;

drop policy if exists "crm_clientes_select" on gestao_crm.clientes;
create policy "crm_clientes_select"
  on gestao_crm.clientes
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_clientes_manage" on gestao_crm.clientes;
create policy "crm_clientes_manage"
  on gestao_crm.clientes
  for all
  to authenticated
  using (public.crm_can_manage())
  with check (public.crm_can_manage());

drop policy if exists "crm_leads_select" on gestao_crm.leads;
create policy "crm_leads_select"
  on gestao_crm.leads
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_leads_manage" on gestao_crm.leads;
create policy "crm_leads_manage"
  on gestao_crm.leads
  for all
  to authenticated
  using (public.crm_can_manage())
  with check (public.crm_can_manage());

drop policy if exists "crm_atendimentos_select" on gestao_crm.atendimentos;
create policy "crm_atendimentos_select"
  on gestao_crm.atendimentos
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_atendimentos_manage" on gestao_crm.atendimentos;
create policy "crm_atendimentos_manage"
  on gestao_crm.atendimentos
  for all
  to authenticated
  using (public.crm_can_manage())
  with check (public.crm_can_manage());

drop policy if exists "crm_historico_atendimentos_select" on gestao_crm.historico_atendimentos;
create policy "crm_historico_atendimentos_select"
  on gestao_crm.historico_atendimentos
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_historico_atendimentos_manage" on gestao_crm.historico_atendimentos;
create policy "crm_historico_atendimentos_manage"
  on gestao_crm.historico_atendimentos
  for all
  to authenticated
  using (public.crm_can_manage())
  with check (public.crm_can_manage());

grant usage on schema gestao_crm to authenticated;
grant usage on schema gestao_crm to service_role;
grant select, insert, update, delete on all tables in schema gestao_crm to authenticated;
grant select, insert, update, delete on all tables in schema gestao_crm to service_role;

alter default privileges in schema gestao_crm
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema gestao_crm
grant select, insert, update, delete on tables to service_role;

notify pgrst, 'reload schema';

create or replace function gestao_crm.prevent_activity_when_lead_has_planned_one()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if exists (
    select 1
    from gestao_crm.atendimentos existing
    where existing.lead_id = new.lead_id
      and existing.status = 'planejada'
  ) then
    raise exception using
      errcode = '23505',
      message = 'Este lead ja possui uma atividade planejada.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_activity_guard_planned on gestao_crm.atendimentos;
create trigger trg_crm_activity_guard_planned
before insert on gestao_crm.atendimentos
for each row
execute function gestao_crm.prevent_activity_when_lead_has_planned_one();