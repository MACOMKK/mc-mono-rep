alter table gestao_crm.veiculos_interesse
  add column if not exists marca_id uuid references gestao_crm.marcas_veiculo(id),
  add column if not exists modelo_id uuid references gestao_crm.modelos_veiculo(id),
  add column if not exists marca_outro text,
  add column if not exists modelo_outro text,
  add column if not exists atributos jsonb not null default '{}';

create index if not exists idx_crm_veiculos_interesse_marca_id
  on gestao_crm.veiculos_interesse (marca_id);
create index if not exists idx_crm_veiculos_interesse_modelo_id
  on gestao_crm.veiculos_interesse (modelo_id);

insert into gestao_crm.categorias_veiculo (nome, ativo)
values ('Não informado', false)
on conflict (nome) do nothing;

update gestao_crm.veiculos_interesse
set categoria_veiculo_id = (select id from gestao_crm.categorias_veiculo where nome = 'Não informado')
where categoria_veiculo_id is null;

alter table gestao_crm.veiculos_interesse
  alter column categoria_veiculo_id set not null;

alter table gestao_crm.atendimentos
  drop constraint if exists atendimentos_tipo_atendimento_check;
alter table gestao_crm.atendimentos
  add constraint atendimentos_tipo_atendimento_check
  check (tipo_atendimento in ('ligacao', 'whatsapp', 'email', 'visita', 'test_drive', 'tarefa'));

notify pgrst, 'reload schema';
