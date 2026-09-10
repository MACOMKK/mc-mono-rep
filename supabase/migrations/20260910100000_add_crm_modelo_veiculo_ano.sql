alter table gestao_crm.modelos_veiculo
  add column if not exists ano_inicio integer,
  add column if not exists ano_fim integer;

alter table gestao_crm.modelos_veiculo
  drop constraint if exists modelos_veiculo_ano_check;
alter table gestao_crm.modelos_veiculo
  add constraint modelos_veiculo_ano_check
  check (ano_fim is null or ano_inicio is null or ano_fim >= ano_inicio);

notify pgrst, 'reload schema';
