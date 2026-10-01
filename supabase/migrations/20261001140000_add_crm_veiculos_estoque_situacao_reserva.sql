-- Situacao fisica/operacional do veiculo em estoque (ex.: saida para demonstracao,
-- imobilizado) e a reserva manual (vendedor + cliente), independentes do status
-- comercial (disponivel/reservado/vendido) ja existente. Campos 100% manuais, sem
-- automacao/trigger por tras -- mesmo padrao ja usado hoje para status='reservado'.

alter table gestao_crm.veiculos_estoque
  add column situacao text not null default 'estoque'
    check (situacao in ('estoque', 'saida_demonstracao', 'imobilizado')),
  add column vendedor_reserva_id uuid references public.colaboradores(id) on delete set null,
  add column cliente_reserva_id uuid references gestao_crm.clientes_crm(id) on delete set null;

create index if not exists idx_crm_veiculos_estoque_situacao
  on gestao_crm.veiculos_estoque (situacao);
create index if not exists idx_crm_veiculos_estoque_vendedor_reserva_id
  on gestao_crm.veiculos_estoque (vendedor_reserva_id);
create index if not exists idx_crm_veiculos_estoque_cliente_reserva_id
  on gestao_crm.veiculos_estoque (cliente_reserva_id);

notify pgrst, 'reload schema';
