-- A migration 20260915120000_extract_public_clientes.sql ja foi aplicada em producao
-- com a versao anterior do arquivo (antes da decisao de renomear a extensao para
-- deixar explicito que ela e so a extensao comercial, no molde de veiculos_estoque --
-- ver comentario no topo daquele arquivo). Editar aquela migration depois de ja
-- aplicada nao tem efeito no banco, entao o rename entra aqui, numa migration nova.
--
-- Constraints/indices (clientes_pkey, clientes_id_fkey, clientes_criado_por_fkey,
-- clientes_empresa_check, clientes_status_relacionamento_check) nao precisam ser
-- renomeados -- o nome deles nao afeta nada no crm-api/index.ts nem no frontend,
-- so o nome da tabela e usado nas queries.
alter table gestao_crm.clientes rename to clientes_crm;

notify pgrst, 'reload schema';
