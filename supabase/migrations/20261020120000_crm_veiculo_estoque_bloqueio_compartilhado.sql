-- Nivel 2 da auditoria do CRM (2026-10-20): validate_venda_veiculo_estoque() (trg em vendas) e
-- prepare_proposta_business_state() (trg em propostas) duplicavam a mesma regra de bloqueio
-- (situacao='imobilizado' e status='reservado' para outro vendedor), sem funcao compartilhada --
-- qualquer ajuste futuro precisava ser replicado manualmente nas duas. Extrai a regra para
-- gestao_crm.ensure_veiculo_estoque_disponivel(), chamada pelas duas triggers. Comportamento
-- identico ao anterior (mesmas mensagens/errcode), so bloqueio de 'vendido' continua exclusivo
-- de propostas (vendas nunca aponta pra um veiculo ja vendido por construcao do fluxo).

create or replace function gestao_crm.ensure_veiculo_estoque_disponivel(
  p_veiculo_estoque_id uuid,
  p_vendedor_id uuid,
  p_bloquear_vendido boolean default false
)
returns void
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  estoque_status text;
  estoque_situacao text;
  estoque_vendedor_reserva_id uuid;
begin
  select status, situacao, vendedor_reserva_id
  into estoque_status, estoque_situacao, estoque_vendedor_reserva_id
  from gestao_crm.veiculos_estoque
  where id = p_veiculo_estoque_id;

  if p_bloquear_vendido and estoque_status = 'vendido' then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo ja foi vendido.';
  end if;

  if estoque_situacao = 'imobilizado' then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo esta imobilizado.';
  end if;

  if estoque_status = 'reservado'
     and (estoque_vendedor_reserva_id is null or p_vendedor_id is distinct from estoque_vendedor_reserva_id) then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo esta reservado para outro vendedor.';
  end if;
end;
$$;

comment on function gestao_crm.ensure_veiculo_estoque_disponivel(uuid, uuid, boolean) is
  'Regra compartilhada de bloqueio de veiculo do estoque (imobilizado / reservado para outro '
  'vendedor), usada por validate_venda_veiculo_estoque() e prepare_proposta_business_state(). '
  'p_bloquear_vendido so e true em propostas -- vendas nunca aponta pra veiculo ja vendido.';

create or replace function gestao_crm.validate_venda_veiculo_estoque()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.veiculo_estoque_id is null then
    return new;
  end if;

  perform gestao_crm.ensure_veiculo_estoque_disponivel(new.veiculo_estoque_id, new.vendedor_id);

  return new;
end;
$$;

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
