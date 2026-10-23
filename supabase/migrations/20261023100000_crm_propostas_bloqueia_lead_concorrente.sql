-- Fecha uma brecha na regra de "um lead ativo por cliente" (idx_crm_leads_cliente_ativo_unique,
-- 20261002220000): essa trava so impede CRIAR um lead novo com etapa_tipo = 'em_andamento' pra um
-- cliente que ja tem outro lead ativo -- mas nao impede criar uma PROPOSTA presa a um lead antigo
-- e ja fechado (ganho/perdido) desse mesmo cliente, mesmo com outro lead ativo concorrente em
-- outra unidade/vendedor. Ou seja, uma unidade podia "roubar" um cliente que ja esta em
-- negociacao ativa em outra unidade, contornando a trava de lead so porque nao estava criando um
-- lead novo.
--
-- Regra: so permite criar/atualizar uma proposta se o lead dela FOR o lead ativo atual do
-- cliente, ou se o cliente nao tiver nenhum lead ativo concorrente. Nao bloqueia proposta nova
-- dentro do proprio lead ativo (fluxo normal). Decisao de produto (2026-10-23): exclusividade do
-- cliente vale so enquanto o lead estiver ativo -- depois que fecha (ganho ou perdido), o cliente
-- fica livre pra qualquer unidade de novo (ver crm_clientes_sem_restricao_posse.md).

create or replace function gestao_crm.prepare_proposta_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  competing_lead_id uuid;
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

  select id
  into competing_lead_id
  from gestao_crm.leads
  where cliente_id = linked_client_id
    and etapa_tipo = 'em_andamento'
    and id <> new.lead_id
  limit 1;

  if competing_lead_id is not null then
    raise exception using
      errcode = '23514',
      message = 'Este cliente ja possui um lead ativo em outra negociacao.';
  end if;

  if new.veiculo_estoque_id is not null
     and (
       tg_op = 'INSERT'
       or new.veiculo_estoque_id is distinct from old.veiculo_estoque_id
       or new.vendedor_id is distinct from old.vendedor_id
     ) then
    perform gestao_crm.ensure_veiculo_estoque_disponivel(new.veiculo_estoque_id, new.vendedor_id, true);
  end if;

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

notify pgrst, 'reload schema';
