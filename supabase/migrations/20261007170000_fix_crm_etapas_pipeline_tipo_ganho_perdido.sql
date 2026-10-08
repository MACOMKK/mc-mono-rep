-- Corrige o `tipo` das etapas livres "GANHO"/"PERDIDO" dos pipelines CONSÓRCIO e MOTOS, criadas
-- pela tela de Pipelines com tipo default 'em_andamento' (a tela não permite editar o tipo de uma
-- etapa já existente). Achado durante os testes de aceitação do funil de Leads: sem impacto hoje
-- (nenhum lead nesses pipelines ainda), mas precisa estar correto antes da fase 2.7 (multi-pipeline).

update gestao_crm.etapas_pipeline set tipo = 'ganho'   where id = 'b9a2f616-4e82-435d-9625-e05f13e90a46'; -- CONSÓRCIO · GANHO
update gestao_crm.etapas_pipeline set tipo = 'perdido' where id = '9a1da6ad-fbeb-4ebf-a242-b0fc7ab1eaae'; -- CONSÓRCIO · PERDIDO
update gestao_crm.etapas_pipeline set tipo = 'ganho'   where id = '364b423b-3cb5-4f0a-b8ae-48598b7bc6ec'; -- MOTOS · GANHO
update gestao_crm.etapas_pipeline set tipo = 'perdido' where id = 'f8cce4ee-b7ff-4ebf-8667-8f4d87a0ed7f'; -- MOTOS · PERDIDO
