-- Fecha a lacuna da reserva de estoque (vendedor_reserva_id/cliente_reserva_id) sobrevivendo
-- depois do veiculo deixar de estar reservado. A constraint chk_veiculos_estoque_reserva_consistente
-- (20261001150000) so garantia uma direcao: status='reservado' exige reserva preenchida. Nao
-- garantia o inverso, entao um veiculo podia virar 'disponivel' ou 'vendido' (via
-- apply_venda_outcome()) e manter vendedor_reserva_id/cliente_reserva_id do estado anterior como
-- dado morto. Agora a constraint passa a ser simetrica, e uma trigger nova zera a reserva sempre
-- que o status sai de 'reservado' -- cobre apply_venda_outcome() e o botao "Editar reserva" da
-- tela de Estoque sem precisar mudar nenhum dos dois.

alter table gestao_crm.veiculos_estoque
  drop constraint if exists chk_veiculos_estoque_reserva_consistente;

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
  end if;

  return new;
end;
$$;

comment on function gestao_crm.clear_veiculo_estoque_reserva() is
  'Zera vendedor_reserva_id/cliente_reserva_id sempre que status deixa de ser "reservado", para '
  'satisfazer a constraint simetrica chk_veiculos_estoque_reserva_consistente dentro do mesmo '
  'UPDATE (roda antes da checagem, que avalia no fim do BEFORE). Cobre qualquer caminho que mude '
  'status, incluindo apply_venda_outcome() e a edicao manual de reserva na tela de Estoque, sem '
  'exigir mudanca nenhuma dessas chamadas.';

drop trigger if exists trg_crm_veiculos_estoque_clear_reserva on gestao_crm.veiculos_estoque;
create trigger trg_crm_veiculos_estoque_clear_reserva
  before update on gestao_crm.veiculos_estoque
  for each row execute function gestao_crm.clear_veiculo_estoque_reserva();

alter table gestao_crm.veiculos_estoque
  add constraint chk_veiculos_estoque_reserva_consistente check (
    (status = 'reservado' and vendedor_reserva_id is not null and cliente_reserva_id is not null)
    or (status <> 'reservado' and vendedor_reserva_id is null and cliente_reserva_id is null)
  );

notify pgrst, 'reload schema';
