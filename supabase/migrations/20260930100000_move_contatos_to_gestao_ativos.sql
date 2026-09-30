-- contatos (fornecedores/contatos externos) e exclusivo do app central:
-- move de public para gestao_ativos. Indices, trigger, unique de telefone e
-- FK para public.unidades acompanham a tabela.
alter table if exists public.contatos set schema gestao_ativos;
