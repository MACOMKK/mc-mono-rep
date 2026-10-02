-- Troca `ordem` de integer (sequencia fechada, sem gaps) para numeric
-- (indexacao fracionaria, padrao Trello/Jira/Linear para listas reordenaveis).
--
-- Com integer + unique(pipeline_id, ordem), toda criacao/exclusao/reorder
-- precisava renumerar o resto da lista para manter a sequencia 0,1,2,3...
-- fechada, e isso foi causa raiz de duas colisoes transitorias da constraint
-- unica (ver migration 20261001170000 e o fix de handleDragEnd em
-- Pipelines.jsx). Com numeric, criar usa max(ordem)+1 e mover usa o ponto
-- medio entre as duas vizinhas do destino -- nenhuma outra linha precisa ser
-- tocada, e o resultado nunca colide com um valor existente (ponto medio
-- entre dois valores unicos e sempre estritamente diferente dos dois).
--
-- Valores inteiros existentes (0,1,2,3...) continuam validos como estao.
alter table gestao_crm.etapas_pipeline
  alter column ordem type numeric using ordem::numeric;

notify pgrst, 'reload schema';
