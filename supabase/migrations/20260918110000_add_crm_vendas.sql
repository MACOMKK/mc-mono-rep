-- Registro formal de venda: amarra cliente + veiculo do estoque + valor + vendedor +
-- data numa unica transacao, e dispara automaticamente a baixa do estoque e a
-- conversao do lead (que ate aqui eram sempre manuais e desconectadas entre si).
--
-- TODO (fora de escopo desta rodada, debito tecnico conhecido):
--   - Comissao de vendedor: quando for modelada, provavelmente uma tabela
--     gestao_crm.comissoes referenciando vendas.id + vendedor_id + regra de percentual.
--   - Cancelamento/estorno de venda nao e tratado (unique(veiculo_estoque_id) impede
--     vender o mesmo veiculo duas vezes, mas nao ha fluxo para desfazer uma venda).

alter table gestao_crm.historico_atendimentos
  drop constraint if exists historico_atendimentos_tipo_check;

alter table gestao_crm.historico_atendimentos
  add constraint historico_atendimentos_tipo_check
  check (tipo in (
    'entrada_lead',
    'atendimento',
    'conversao_lead',
    'observacao',
    'atualizacao_lead',
    'atribuicao_lead',
    'venda_fechada'
  ));

create table if not exists gestao_crm.vendas (
  id uuid primary key default gen_random_uuid(),
  proposta_id uuid references gestao_crm.propostas(id) on delete set null,
  lead_id uuid not null references gestao_crm.leads(id) on delete cascade,
  cliente_id uuid not null references gestao_crm.clientes_crm(id) on delete cascade,
  veiculo_estoque_id uuid not null references gestao_crm.veiculos_estoque(id),
  vendedor_id uuid not null references public.colaboradores(id) on delete restrict,
  valor_final numeric(12, 2) not null check (valor_final >= 0),
  forma_pagamento text not null
    check (forma_pagamento in ('a_vista', 'financiamento', 'consorcio', 'troca')),
  desconto_valor numeric(12, 2) not null default 0 check (desconto_valor >= 0),
  data_venda date not null default current_date,
  motivo_status_id uuid not null references gestao_crm.motivos_status(id),
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (veiculo_estoque_id)
);

drop trigger if exists trg_crm_vendas_set_updated_at on gestao_crm.vendas;
create trigger trg_crm_vendas_set_updated_at
before update on gestao_crm.vendas
for each row execute function public.set_updated_at();

create or replace function gestao_crm.prepare_venda_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  estoque_status text;
begin
  select cliente_id
  into linked_client_id
  from gestao_crm.leads
  where id = new.lead_id;

  if linked_client_id is null then
    raise exception using
      errcode = '23503',
      message = 'Lead vinculado a venda nao foi encontrado.';
  end if;

  new.cliente_id = linked_client_id;

  select status into estoque_status
  from gestao_crm.veiculos_estoque
  where id = new.veiculo_estoque_id;

  if estoque_status is null then
    raise exception using
      errcode = '23503',
      message = 'Veiculo em estoque nao foi encontrado.';
  end if;

  if estoque_status = 'vendido' then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo ja foi vendido.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_vendas_business_state on gestao_crm.vendas;
create trigger trg_crm_vendas_business_state
before insert on gestao_crm.vendas
for each row
execute function gestao_crm.prepare_venda_business_state();

-- Gatilho unico que fecha o ciclo: baixa o veiculo do estoque, converte o lead
-- (reaproveitando prepare_lead_phase1() para validar motivo_status_id) e registra o
-- evento no historico. A conversao do lead aqui dispara tambem o trigger central de
-- sincronia de gestao_crm.clientes_crm criado em
-- 20260918120000_centralize_crm_cliente_status_sync.sql -- nenhuma regra duplicada.
create or replace function gestao_crm.apply_venda_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  update gestao_crm.veiculos_estoque
  set status = 'vendido'
  where id = new.veiculo_estoque_id;

  update gestao_crm.leads
  set status = 'convertido', motivo_status_id = new.motivo_status_id
  where id = new.lead_id;

  insert into gestao_crm.historico_atendimentos (
    cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados, criado_por
  ) values (
    new.cliente_id,
    new.lead_id,
    'venda_fechada',
    format('Venda fechada no valor de %s.', new.valor_final),
    'Venda',
    new.id,
    'convertido',
    jsonb_build_object(
      'venda_id', new.id,
      'proposta_id', new.proposta_id,
      'veiculo_estoque_id', new.veiculo_estoque_id,
      'valor_final', new.valor_final,
      'vendedor_id', new.vendedor_id
    ),
    new.criado_por
  );

  return new;
end;
$$;

drop trigger if exists trg_crm_vendas_outcome on gestao_crm.vendas;
create trigger trg_crm_vendas_outcome
after insert on gestao_crm.vendas
for each row
execute function gestao_crm.apply_venda_outcome();

grant execute on function gestao_crm.prepare_venda_business_state() to authenticated, service_role;
grant execute on function gestao_crm.apply_venda_outcome() to authenticated, service_role;

alter table gestao_crm.vendas enable row level security;

drop policy if exists "crm_vendas_select" on gestao_crm.vendas;
create policy "crm_vendas_select" on gestao_crm.vendas
for select to authenticated using (public.crm_can_access_lead(lead_id));

drop policy if exists "crm_vendas_manage" on gestao_crm.vendas;
create policy "crm_vendas_manage" on gestao_crm.vendas
for all to authenticated
using (public.crm_can_access_lead(lead_id))
with check (public.crm_can_access_lead(lead_id));

grant select, insert, update, delete on gestao_crm.vendas to authenticated, service_role;

alter table gestao_crm.vendas replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'vendas'
  ) then
    alter publication supabase_realtime add table gestao_crm.vendas;
  end if;
end
$$;

create index if not exists idx_crm_vendas_lead_id on gestao_crm.vendas (lead_id);
create index if not exists idx_crm_vendas_cliente_id on gestao_crm.vendas (cliente_id);
create index if not exists idx_crm_vendas_vendedor_id on gestao_crm.vendas (vendedor_id);
create index if not exists idx_crm_vendas_proposta_id on gestao_crm.vendas (proposta_id);

notify pgrst, 'reload schema';
