-- 20260910130000_extract_public_veiculos.sql foi editado (removendo
-- modelo_outro/versao_outro) depois de ja ter sido aplicada em producao,
-- entao as colunas continuaram existindo no banco. Esta migration corrige
-- isso removendo de fato as colunas: public.veiculos sempre exige
-- modelo_id/versao_id cadastrados no catalogo, sem fallback de texto livre
-- (diferente de gestao_crm.veiculos_interesse, que mantem o fallback).

alter table public.veiculos
  drop column if exists modelo_outro,
  drop column if exists versao_outro;

notify pgrst, 'reload schema';
