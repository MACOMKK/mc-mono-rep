-- Nivel 2 da auditoria do CRM (2026-10-20): constraints faltando apontadas na auditoria.
--
-- 1) pipeline_automacoes.resultado sem check batendo com os valores validos -- hoje so e
--    restrito pelo dropdown do frontend (RESULTADO_ATIVIDADE_LABEL, Pipelines.jsx), nada impede
--    inserir via API um resultado invalido ou um dos dois resultados nao-configuraveis
--    (venda_realizada/lead_perdido resolvem por chave_sistema/tipo, apply_activity_outcome() nunca
--    le pipeline_automacoes para eles -- uma automacao cadastrada com esses valores ficaria
--    silenciosamente morta, nunca lida).
-- 2) veiculos_estoque.preco sem check (preco >= 0), inconsistente com os demais campos
--    monetarios do schema (propostas.valor_veiculo/valor_final/valor_entrada, vendas.valor_final
--    ja tem o check).
-- 3) FKs sem on delete explicito (hoje usam o default do Postgres, NO ACTION -- bloqueia o
--    delete do lado referenciado, mesmo efeito pratico de restrict, so nao documentado):
--    public.veiculos.modelo_id/versao_id (modelo_id/versao_id saiu de
--    gestao_crm.veiculos_estoque na migracao 20260910130000, que extraiu o veiculo fisico pra
--    public.veiculos -- veiculos_estoque hoje so referencia via veiculo_id), propostas.veiculo_estoque_id,
--    vendas.veiculo_estoque_id, clientes_crm.id (constraint real chama-se clientes_id_fkey, nao
--    clientes_crm_id_fkey). Tornado explicito como restrict, sem mudanca de comportamento (NO
--    ACTION e restrict sao equivalentes para constraint nao-deferrable, que e o caso de todas
--    essas).

alter table gestao_crm.pipeline_automacoes
  drop constraint if exists pipeline_automacoes_resultado_check;
alter table gestao_crm.pipeline_automacoes
  add constraint pipeline_automacoes_resultado_check
  check (resultado in (
    'contato_realizado',
    'sem_resposta',
    'visita_agendada',
    'test_drive',
    'proposta_enviada'
  ));

alter table gestao_crm.veiculos_estoque
  drop constraint if exists veiculos_estoque_preco_check;
alter table gestao_crm.veiculos_estoque
  add constraint veiculos_estoque_preco_check
  check (preco is null or preco >= 0);

alter table public.veiculos
  drop constraint if exists veiculos_modelo_id_fkey;
alter table public.veiculos
  add constraint veiculos_modelo_id_fkey
  foreign key (modelo_id) references public.modelos_veiculo(id) on delete restrict;

alter table public.veiculos
  drop constraint if exists veiculos_versao_id_fkey;
alter table public.veiculos
  add constraint veiculos_versao_id_fkey
  foreign key (versao_id) references public.versoes_veiculo(id) on delete restrict;

alter table gestao_crm.propostas
  drop constraint if exists propostas_veiculo_estoque_id_fkey;
alter table gestao_crm.propostas
  add constraint propostas_veiculo_estoque_id_fkey
  foreign key (veiculo_estoque_id) references gestao_crm.veiculos_estoque(id) on delete restrict;

alter table gestao_crm.vendas
  drop constraint if exists vendas_veiculo_estoque_id_fkey;
alter table gestao_crm.vendas
  add constraint vendas_veiculo_estoque_id_fkey
  foreign key (veiculo_estoque_id) references gestao_crm.veiculos_estoque(id) on delete restrict;

alter table gestao_crm.clientes_crm
  drop constraint if exists clientes_id_fkey;
alter table gestao_crm.clientes_crm
  add constraint clientes_id_fkey
  foreign key (id) references public.clientes(id) on delete restrict;

notify pgrst, 'reload schema';
