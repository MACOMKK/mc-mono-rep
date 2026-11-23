-- "usado" era redundante com "seminovo" na pratica (Estoque.jsx ja tratava a aba "Seminovos"
-- como ['seminovo', 'usado']) -- removido por decisao de produto. Migra qualquer linha existente
-- antes de apertar a constraint, nas duas tabelas que compartilham esse enum.
update gestao_crm.veiculos_estoque set condicao = 'seminovo' where condicao = 'usado';
update gestao_crm.veiculos_interesse set condicao = 'seminovo' where condicao = 'usado';

alter table gestao_crm.veiculos_estoque
  drop constraint veiculos_estoque_condicao_check;
alter table gestao_crm.veiculos_estoque
  add constraint veiculos_estoque_condicao_check
  check (condicao in ('novo', 'seminovo'));

alter table gestao_crm.veiculos_interesse
  drop constraint veiculos_interesse_condicao_check;
alter table gestao_crm.veiculos_interesse
  add constraint veiculos_interesse_condicao_check
  check (condicao in ('novo', 'seminovo'));

notify pgrst, 'reload schema';
