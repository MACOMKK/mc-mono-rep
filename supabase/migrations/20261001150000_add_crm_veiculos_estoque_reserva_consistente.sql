-- Garante que status='reservado' nunca fique sem vendedor/cliente de reserva
-- preenchidos -- pre-requisito para a trigger de propostas (ver
-- 20261001160000_block_proposta_veiculo_reservado_outro_vendedor.sql) conseguir
-- identificar sem ambiguidade quem reservou o veiculo.
alter table gestao_crm.veiculos_estoque
  add constraint chk_veiculos_estoque_reserva_consistente
  check (
    status <> 'reservado'
    or (vendedor_reserva_id is not null and cliente_reserva_id is not null)
  );

notify pgrst, 'reload schema';
