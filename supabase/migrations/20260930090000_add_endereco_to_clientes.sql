-- Adiciona campos de endereco a public.clientes. Nenhum app grava endereco de
-- cliente hoje (nem public.clientes nem gestao_crm.clientes_crm tem essas
-- colunas) -- motivado pela importacao de uma base externa de cliente/veiculo
-- (planilha de concessionaria) que traz ENDERECO/BAIRRO/MUNICIPIO/UF/CEP por
-- cliente. Colunas ficam em public.clientes (nao numa extensao por app) pelo
-- mesmo raciocinio ja usado para telefone/email: endereco e atributo de
-- identidade generico, reutilizavel por CRM e Oficina, nao especifico de um
-- modulo.

alter table public.clientes
  add column endereco text,
  add column bairro text,
  add column municipio text,
  add column uf text,
  add column cep text;

notify pgrst, 'reload schema';
