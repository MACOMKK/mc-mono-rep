-- TTL de reserva: coluna reserva_expira_em, preenchida pela action veiculo_estoque_reserva ao
-- reservar (prazo configuravel, default 48h). Nullable -- reserva sem prazo (dados antigos, ou
-- caso a action seja chamada sem prazoHoras) continua valida indefinidamente, sem exigir backfill.
-- A limpeza automatica roda via cron (ver migration schedule_crm_veiculos_estoque_expira_reserva),
-- chamando a edge function dedicada crm-veiculos-estoque-expira-reserva.

alter table gestao_crm.veiculos_estoque
  add column if not exists reserva_expira_em timestamptz;

-- A trigger trg_crm_veiculos_estoque_clear_reserva (20261016160000) ja zera vendedor_reserva_id/
-- cliente_reserva_id sempre que status sai de 'reservado'. Sem isso, reserva_expira_em ficaria
-- como data morta apontando pra um prazo que nao significa mais nada.
create or replace function gestao_crm.clear_veiculo_estoque_reserva()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if old.status = 'reservado' and new.status is distinct from 'reservado' then
    new.vendedor_reserva_id := null;
    new.cliente_reserva_id := null;
    new.reserva_expira_em := null;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
