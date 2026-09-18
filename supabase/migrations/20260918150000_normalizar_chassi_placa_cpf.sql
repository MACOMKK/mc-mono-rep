-- Fecha lacunas de unicidade de cliente/veiculo: placa nao tinha nenhuma
-- constraint (dois veiculos podiam ter a mesma placa); chassi tem unique()
-- mas sem normalizacao de caixa (case-sensitive deixava "abc123" e "ABC123"
-- passarem como valores diferentes); cpf_cnpj tinha indice unico sobre o
-- valor bruto, entao "123.456.789-00" e "12345678900" nao eram vistos como
-- duplicata. Mesmo padrao ja usado para telefone_normalizado/email_normalizado
-- em 20260915120000_extract_public_clientes.sql.

update public.veiculos set chassi = upper(trim(chassi));

update public.veiculos set placa = upper(regexp_replace(placa, '\s', '', 'g'))
  where placa is not null;

create unique index idx_veiculos_placa_unique
  on public.veiculos (placa)
  where placa is not null and placa <> '';

alter table public.clientes add column cpf_cnpj_normalizado text;

update public.clientes
  set cpf_cnpj_normalizado = regexp_replace(cpf_cnpj, '\D', '', 'g')
  where cpf_cnpj is not null and cpf_cnpj <> '';

drop index if exists idx_clientes_cpf_cnpj_unique;

create unique index idx_clientes_cpf_cnpj_unique
  on public.clientes (cpf_cnpj_normalizado)
  where cpf_cnpj_normalizado is not null and cpf_cnpj_normalizado <> '';

notify pgrst, 'reload schema';
