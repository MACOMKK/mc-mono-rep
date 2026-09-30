-- Adiciona o ano do veiculo (ano/modelo) a public.veiculos. O catalogo
-- (marcas_veiculo -> modelos_veiculo -> versoes_veiculo) so guarda faixa
-- ano_inicio/ano_fim por modelo/versao, nao o ano de um veiculo especifico --
-- nao serve para registrar ANO_MODELO de uma base importada, onde cada
-- veiculo fisico tem seu proprio ano.

alter table public.veiculos
  add column ano integer;

notify pgrst, 'reload schema';
