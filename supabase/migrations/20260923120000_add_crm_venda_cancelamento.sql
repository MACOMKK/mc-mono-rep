-- Fecha o gap documentado no cabecalho de 20260918110000_add_crm_vendas.sql: ate aqui
-- nao havia como desfazer uma venda registrada por engano (veiculo trocado, valor
-- errado, cliente desistiu). O veiculo ficava travado como 'vendido' para sempre
-- (unique(veiculo_estoque_id) tambem impedia recriar venda pro mesmo veiculo).
--
-- Soft cancel: o registro da venda nunca e apagado (dado financeiro/auditavel), so
-- ganha status='cancelada' + motivo/data/autor. A reversao de leads.status e feita
-- pela action 'cancel_venda' (supabase/functions/crm-api/index.ts), nao por uma trigger
-- aqui -- ela precisa de input do usuario (nova previsao_fechamento) que uma trigger
-- AFTER UPDATE nao tem, e so deve reverter o lead se ele ainda estiver 'convertido'
-- (pode ja ter mudado de status por outro motivo depois da venda). A proposta associada
-- (quando houver) nao e revertida -- continua 'aceita' como registro historico do que
-- foi ofertado/aceito.

alter table gestao_crm.vendas
  add column if not exists status text not null default 'concluida'
    check (status in ('concluida', 'cancelada')),
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text,
  add column if not exists cancelada_por uuid references public.colaboradores(id) on delete set null;

alter table gestao_crm.vendas
  drop constraint if exists vendas_veiculo_estoque_id_key;

drop index if exists gestao_crm.idx_crm_vendas_veiculo_estoque_ativo;
create unique index idx_crm_vendas_veiculo_estoque_ativo
  on gestao_crm.vendas (veiculo_estoque_id)
  where status = 'concluida';

alter table gestao_crm.historico_atendimentos
  drop constraint if exists historico_atendimentos_tipo_check;

alter table gestao_crm.historico_atendimentos
  add constraint historico_atendimentos_tipo_check
  check (tipo in (
    'entrada_lead',
    'atendimento',
    'conversao_lead',
    'observacao',
    'atualizacao_lead',
    'atribuicao_lead',
    'venda_fechada',
    'venda_cancelada'
  ));

comment on column gestao_crm.vendas.status is
  'concluida (padrao) ou cancelada (soft cancel via action cancel_venda). Nunca apagar '
  'a linha -- e dado financeiro/auditavel. O indice unico em veiculo_estoque_id so vale '
  'para status=concluida (idx_crm_vendas_veiculo_estoque_ativo), permitindo vender o '
  'mesmo veiculo de novo apos um cancelamento.';

notify pgrst, 'reload schema';
