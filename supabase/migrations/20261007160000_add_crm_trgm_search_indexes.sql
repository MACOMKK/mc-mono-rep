-- buildSearchFilter (crm-api) sempre monta ILIKE '%termo%' -- indices B-tree existentes so
-- ajudam prefixo, nunca "contem". GIN trigram cobre ILIKE de substring com bitmap scan.
-- Nao criado para telefone (ja usa indice de igualdade + busca por digitos) nem para tabelas
-- pequenas (origens_lead, colaboradores). GIN trigram tem custo de escrita maior -- medir
-- impacto em INSERT/UPDATE de leads (coluna de alta escrita) antes de generalizar mais.
create extension if not exists pg_trgm;

create index if not exists idx_crm_leads_nome_trgm
  on gestao_crm.leads using gin (lower(nome) gin_trgm_ops);
create index if not exists idx_crm_leads_modelo_interesse_trgm
  on gestao_crm.leads using gin (lower(modelo_interesse) gin_trgm_ops);

create index if not exists idx_clientes_nome_trgm
  on public.clientes using gin (lower(nome) gin_trgm_ops);
create index if not exists idx_clientes_cpf_cnpj_trgm
  on public.clientes using gin (cpf_cnpj gin_trgm_ops);

create index if not exists idx_crm_veiculos_interesse_marca_trgm
  on gestao_crm.veiculos_interesse using gin (lower(marca) gin_trgm_ops);
create index if not exists idx_crm_veiculos_interesse_modelo_trgm
  on gestao_crm.veiculos_interesse using gin (lower(modelo) gin_trgm_ops);

create index if not exists idx_veiculos_chassi_trgm
  on public.veiculos using gin (lower(chassi) gin_trgm_ops);
create index if not exists idx_veiculos_placa_trgm
  on public.veiculos using gin (lower(placa) gin_trgm_ops);

notify pgrst, 'reload schema';
