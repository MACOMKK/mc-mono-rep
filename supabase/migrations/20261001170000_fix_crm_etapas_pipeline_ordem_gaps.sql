-- Bug: excluir uma etapa no meio do pipeline nao renumerava as remanescentes,
-- deixando lacunas na coluna `ordem` (unique por pipeline_id). O frontend
-- calculava a ordem da proxima etapa como `etapas.length`, que colidia com uma
-- ordem ja existente apos a lacuna, disparando "Ja existe uma etapa nesta
-- posicao do pipeline." (ver apps/crm/src/pages/Pipelines.jsx, corrigido para
-- calcular max(ordem)+1 na criacao e renumerar ao excluir). Esta migration
-- corrige os dados ja gravados com lacuna, fechando a sequencia por pipeline.
--
-- Atualiza linha a linha (em vez de um UPDATE ... FROM em lote) porque a
-- constraint unica (pipeline_id, ordem) e checada imediatamente a cada linha:
-- processando em ordem crescente de `ordem`, o novo valor de cada linha nunca
-- colide com o valor atual de uma linha ainda nao processada (o novo valor e
-- sempre <= o valor original).
do $$
declare
  rec record;
  atual_pipeline uuid;
  contador integer;
begin
  atual_pipeline := null;
  contador := 0;

  for rec in
    select id, pipeline_id, ordem
    from gestao_crm.etapas_pipeline
    order by pipeline_id, ordem
  loop
    if rec.pipeline_id is distinct from atual_pipeline then
      atual_pipeline := rec.pipeline_id;
      contador := 0;
    end if;

    if rec.ordem <> contador then
      update gestao_crm.etapas_pipeline set ordem = contador where id = rec.id;
    end if;

    contador := contador + 1;
  end loop;
end
$$;

notify pgrst, 'reload schema';
