-- Bloqueia proposta duplicada: mesmo cliente + mesmo veiculo, ja com proposta ativa
-- (rascunho/enviada). Propostas aceitas/recusadas nao contam -- cliente pode reabrir
-- negociacao do mesmo carro depois de uma recusa. Dois indices porque veiculo e
-- representado por veiculo_estoque_id (FK) OU veiculo_descricao (texto livre), nunca
-- os dois (propostas_veiculo_check, 20260918100000). cliente_id ja vem derivado do
-- lead_id pelo trigger prepare_proposta_business_state() antes do insert/update, entao
-- o indice cobre create e update sem precisar de checagem extra em codigo.

create unique index if not exists idx_crm_propostas_cliente_veiculo_estoque_ativa_unique
  on gestao_crm.propostas (cliente_id, veiculo_estoque_id)
  where status in ('rascunho', 'enviada') and veiculo_estoque_id is not null;

create unique index if not exists idx_crm_propostas_cliente_veiculo_descricao_ativa_unique
  on gestao_crm.propostas (cliente_id, lower(trim(veiculo_descricao)))
  where status in ('rascunho', 'enviada') and veiculo_estoque_id is null
    and nullif(trim(coalesce(veiculo_descricao, '')), '') is not null;

notify pgrst, 'reload schema';
