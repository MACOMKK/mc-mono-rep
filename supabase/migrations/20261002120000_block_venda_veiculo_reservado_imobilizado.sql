-- Fecha as lacunas da reserva/situacao do estoque:
-- 1) A reserva (status='reservado' + vendedor_reserva_id) so era validada em propostas.
--    close_venda (venda direta), accept_proposta com vendedor trocado e o aceite de uma
--    proposta criada antes da reserva passavam livres. Agora o INSERT em vendas tambem
--    valida -- ponto unico que cobre accept_proposta e close_venda.
-- 2) situacao='imobilizado' passa a bloquear proposta e venda. 'saida_demonstracao'
--    continua apenas informativa.

create or replace function gestao_crm.validate_venda_veiculo_estoque()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  estoque_status text;
  estoque_situacao text;
  estoque_vendedor_reserva_id uuid;
begin
  if new.veiculo_estoque_id is null then
    return new;
  end if;

  select status, situacao, vendedor_reserva_id
  into estoque_status, estoque_situacao, estoque_vendedor_reserva_id
  from gestao_crm.veiculos_estoque
  where id = new.veiculo_estoque_id;

  if estoque_situacao = 'imobilizado' then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo esta imobilizado.';
  end if;

  if estoque_status = 'reservado'
     and (estoque_vendedor_reserva_id is null or new.vendedor_id is distinct from estoque_vendedor_reserva_id) then
    raise exception using
      errcode = '23514',
      message = 'Este veiculo esta reservado para outro vendedor.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_vendas_validate_veiculo_estoque on gestao_crm.vendas;
create trigger trg_crm_vendas_validate_veiculo_estoque
  before insert on gestao_crm.vendas
  for each row execute function gestao_crm.validate_venda_veiculo_estoque();

-- Mesma funcao de 20261001160000_block_proposta_veiculo_reservado_outro_vendedor.sql,
-- acrescida do bloqueio por situacao='imobilizado'.
create or replace function gestao_crm.prepare_proposta_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  estoque_status text;
  estoque_situacao text;
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
    select status, situacao, vendedor_reserva_id
    into estoque_status, estoque_situacao, estoque_vendedor_reserva_id
    from gestao_crm.veiculos_estoque
    where id = new.veiculo_estoque_id;

    if estoque_status = 'vendido' then
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
