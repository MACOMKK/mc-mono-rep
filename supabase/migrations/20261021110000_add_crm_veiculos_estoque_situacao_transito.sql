-- Adiciona 'transito' aos valores possiveis de situacao (veiculo em deslocamento entre unidades/
-- transportadora), ao lado de estoque/saida_demonstracao/imobilizado ja existentes
-- (20261001140000). Nao entra em ensure_veiculo_estoque_disponivel() -- so 'imobilizado' bloqueia
-- venda/reserva hoje; 'transito' e so informativo, igual 'saida_demonstracao'.

alter table gestao_crm.veiculos_estoque
  drop constraint if exists veiculos_estoque_situacao_check;

alter table gestao_crm.veiculos_estoque
  add constraint veiculos_estoque_situacao_check
    check (situacao in ('estoque', 'saida_demonstracao', 'transito', 'imobilizado'));

notify pgrst, 'reload schema';
