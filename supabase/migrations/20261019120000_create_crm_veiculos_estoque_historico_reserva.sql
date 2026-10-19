-- Historico de reserva de veiculos em estoque (gestao_crm.veiculos_estoque). Ate agora a reserva
-- (vendedor_reserva_id/cliente_reserva_id) era 100% manual e sem rastro: nada registrava quem
-- reservou antes, quando reservou, quando liberou, ou se a troca foi forcada por um gestor sobre a
-- reserva de outro vendedor. Nova tabela dedicada (em vez do historico generico cross-entidade
-- `historico_atendimentos`, que nao e dedicado a veiculo), seguindo o mesmo padrao de
-- anterior/novo + quem + quando usado em `gestao_ativos.ativos_historico_posse`. Gravada pela nova
-- action `veiculo_estoque_reserva` (supabase/functions/crm-api/index.ts), nunca por trigger
-- generica -- mantem a logica de negocio de reserva centralizada num so lugar.

create table if not exists gestao_crm.veiculos_estoque_historico_reserva (
  id uuid primary key default gen_random_uuid(),
  veiculo_estoque_id uuid not null references gestao_crm.veiculos_estoque (id) on delete cascade,
  acao text not null check (acao in ('reservado', 'liberado', 'trocado', 'expirado')),
  vendedor_anterior_id uuid references public.colaboradores (id) on delete set null,
  cliente_anterior_id uuid references gestao_crm.clientes_crm (id) on delete set null,
  vendedor_novo_id uuid references public.colaboradores (id) on delete set null,
  cliente_novo_id uuid references gestao_crm.clientes_crm (id) on delete set null,
  alterado_por uuid references public.colaboradores (id) on delete set null,
  alterado_em timestamptz not null default now()
);

create index if not exists idx_veiculos_estoque_historico_reserva_veiculo
  on gestao_crm.veiculos_estoque_historico_reserva (veiculo_estoque_id, alterado_em desc);

comment on table gestao_crm.veiculos_estoque_historico_reserva is
  'Historico de reservas de veiculos em estoque (quem reservou/liberou/trocou/teve a reserva '
  'expirada, e o estado anterior/novo de vendedor+cliente). Somente leitura via API -- gravado '
  'so pela action veiculo_estoque_reserva e pela edge function de expiracao por TTL.';

notify pgrst, 'reload schema';
