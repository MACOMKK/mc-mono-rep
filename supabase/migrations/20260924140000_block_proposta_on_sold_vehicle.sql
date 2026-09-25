-- Bug: era possivel criar uma nova proposta para um veiculo que ja tinha
-- venda fechada (status 'vendido'), sem aviso algum -- a validacao existia
-- para gestao_crm.vendas (prepare_venda_business_state, ver
-- 20260918110000_add_crm_vendas.sql) mas nunca foi replicada para
-- gestao_crm.propostas. Estende prepare_proposta_business_state() com o
-- mesmo bloco de checagem, reaproveitando a mensagem 'Este veiculo ja foi
-- vendido.' que supabase/functions/crm-api/index.ts ja traduz para o
-- usuario (nenhuma mudanca necessaria na edge function ou no frontend).
create or replace function gestao_crm.prepare_proposta_business_state()
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
      message = 'Lead vinculado a proposta nao foi encontrado.';
  end if;

  new.cliente_id = linked_client_id;

  if new.veiculo_estoque_id is not null
     and (tg_op = 'INSERT' or new.veiculo_estoque_id is distinct from old.veiculo_estoque_id) then
    select status into estoque_status
    from gestao_crm.veiculos_estoque
    where id = new.veiculo_estoque_id;

    if estoque_status = 'vendido' then
      raise exception using
        errcode = '23514',
        message = 'Este veiculo ja foi vendido.';
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
