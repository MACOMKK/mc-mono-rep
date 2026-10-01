-- Enquanto um veiculo esta com status='reservado', so o vendedor da reserva
-- (veiculos_estoque.vendedor_reserva_id) pode criar/editar uma proposta vinculada a ele.
-- Reaproveita o bloco que ja consulta veiculos_estoque em
-- prepare_proposta_business_state() (ver 20260924140000_block_proposta_on_sold_vehicle.sql),
-- agora tambem lendo vendedor_reserva_id. Dispara nao so quando veiculo_estoque_id muda, mas
-- tambem quando vendedor_id muda para um veiculo ja vinculado -- cobre o caso de trocar o
-- vendedor de uma proposta existente para um veiculo reservado.
create or replace function gestao_crm.prepare_proposta_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  estoque_status text;
  estoque_vendedor_reserva_id uuid;
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
    select status, vendedor_reserva_id into estoque_status, estoque_vendedor_reserva_id
    from gestao_crm.veiculos_estoque
    where id = new.veiculo_estoque_id;

    if estoque_status = 'vendido' then
      raise exception using
        errcode = '23514',
        message = 'Este veiculo ja foi vendido.';
    end if;

    if estoque_status = 'reservado'
       and (estoque_vendedor_reserva_id is null or new.vendedor_id is distinct from estoque_vendedor_reserva_id) then
      raise exception using
        errcode = '23514',
        message = 'Este veiculo esta reservado para outro vendedor.';
    end if;
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
