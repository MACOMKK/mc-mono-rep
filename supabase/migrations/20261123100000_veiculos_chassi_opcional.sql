-- Veiculo seminovo/usado frequentemente so tem placa (chassi nem sempre e informado/legivel
-- na hora do cadastro) -- public.veiculos exigia chassi "not null" desde a criacao
-- (20260910130000_extract_public_veiculos.sql), o que travava esse cadastro. Chassi passa a
-- ser opcional, mas pelo menos um dos dois (chassi ou placa) continua obrigatorio -- sem isso
-- nao ha como identificar o veiculo fisico nem checar duplicidade em veiculo_buscar_existente.
alter table public.veiculos
  alter column chassi drop not null;

alter table public.veiculos
  add constraint veiculos_chassi_ou_placa_check
  check (chassi is not null or placa is not null);

notify pgrst, 'reload schema';
