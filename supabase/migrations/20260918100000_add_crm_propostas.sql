-- Proposta/orcamento formal (veiculo + valor + condicoes de pagamento) vinculada a um
-- lead, precedendo o fechamento de uma venda (ver 20260918110000_add_crm_vendas.sql).
-- Preenche a lacuna descrita em apps/crm/CLAUDE.md: hoje nao existe registro algum de
-- oferta com valor antes da conversao do lead.

create table if not exists gestao_crm.propostas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references gestao_crm.leads(id) on delete cascade,
  cliente_id uuid not null references gestao_crm.clientes_crm(id) on delete cascade,
  veiculo_estoque_id uuid references gestao_crm.veiculos_estoque(id),
  veiculo_descricao text,
  valor_veiculo numeric(12, 2) not null check (valor_veiculo >= 0),
  desconto_valor numeric(12, 2) not null default 0 check (desconto_valor >= 0),
  valor_final numeric(12, 2) not null check (valor_final >= 0),
  forma_pagamento text not null
    check (forma_pagamento in ('a_vista', 'financiamento', 'consorcio', 'troca')),
  valor_entrada numeric(12, 2) check (valor_entrada >= 0),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviada', 'aceita', 'recusada')),
  vendedor_id uuid references public.colaboradores(id) on delete set null,
  validade_ate date,
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  aceita_em timestamptz,
  recusada_em timestamptz,
  constraint propostas_veiculo_check
    check (veiculo_estoque_id is not null or nullif(trim(coalesce(veiculo_descricao, '')), '') is not null)
);

-- cliente_id nunca vem do payload do cliente (mesmo padrao de
-- prepare_activity_business_state()): sempre derivado do lead_id, para nao permitir
-- vincular a proposta a um cliente fora do lead.
create or replace function gestao_crm.prepare_proposta_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
begin
  select cliente_id
  into linked_client_id
  from gestao_crm.leads
  where id = new.lead_id;

  if linked_client_id is null then
    raise exception using
      errcode = '23503',
      message = 'Lead vinculado a proposta nao foi encontrado.';
  end if;

  new.cliente_id = linked_client_id;

  if tg_op = 'UPDATE'
     and old.status = 'aceita'
     and new.status is distinct from old.status then
    raise exception using
      errcode = '23514',
      message = 'Proposta aceita nao pode ter o status alterado diretamente.';
  end if;

  if new.status = 'aceita' and (old.status is null or old.status <> 'aceita') then
    new.aceita_em = coalesce(new.aceita_em, now());
  elsif new.status <> 'aceita' then
    new.aceita_em = null;
  end if;

  if new.status = 'recusada' and (old.status is null or old.status <> 'recusada') then
    new.recusada_em = coalesce(new.recusada_em, now());
  elsif new.status <> 'recusada' then
    new.recusada_em = null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_propostas_business_state on gestao_crm.propostas;
create trigger trg_crm_propostas_business_state
before insert or update on gestao_crm.propostas
for each row
execute function gestao_crm.prepare_proposta_business_state();

drop trigger if exists trg_crm_propostas_set_updated_at on gestao_crm.propostas;
create trigger trg_crm_propostas_set_updated_at
before update on gestao_crm.propostas
for each row execute function public.set_updated_at();

grant execute on function gestao_crm.prepare_proposta_business_state() to authenticated, service_role;

alter table gestao_crm.propostas enable row level security;

drop policy if exists "crm_propostas_select" on gestao_crm.propostas;
create policy "crm_propostas_select" on gestao_crm.propostas
for select to authenticated using (public.crm_can_access_lead(lead_id));

drop policy if exists "crm_propostas_manage" on gestao_crm.propostas;
create policy "crm_propostas_manage" on gestao_crm.propostas
for all to authenticated
using (public.crm_can_access_lead(lead_id))
with check (public.crm_can_access_lead(lead_id));

grant select, insert, update, delete on gestao_crm.propostas to authenticated, service_role;

alter table gestao_crm.propostas replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'propostas'
  ) then
    alter publication supabase_realtime add table gestao_crm.propostas;
  end if;
end
$$;

create index if not exists idx_crm_propostas_lead_id on gestao_crm.propostas (lead_id);
create index if not exists idx_crm_propostas_cliente_id on gestao_crm.propostas (cliente_id);
create index if not exists idx_crm_propostas_status on gestao_crm.propostas (status);
create index if not exists idx_crm_propostas_vendedor_id on gestao_crm.propostas (vendedor_id);

notify pgrst, 'reload schema';
