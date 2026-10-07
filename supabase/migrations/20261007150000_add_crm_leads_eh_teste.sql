-- Flag "eh_teste" em gestao_crm.leads, mesmo padrao ja usado em
-- gestao_servicos.checklist_avaliacoes.eh_teste e em public.clientes/public.veiculos/
-- gestao_crm.propostas (20261006120000_add_eh_teste_cliente_veiculo_proposta.sql): so
-- admin/gestor pode marcar na criacao do lead.
--
-- Diferente de cliente/veiculo, a exclusao de lead (lead_excluir_teste em crm-api) FICA
-- condicionada a eh_teste=true -- mesmo padrao de proposta_excluir_teste, pois hoje nao
-- existe nenhuma exclusao segura de lead. atendimentos/veiculos_interesse/propostas/vendas
-- tem "on delete cascade" em lead_id e somem junto; historico_atendimentos/
-- conversas_atendimento tem "on delete set null" e ficam orfaos, como em qualquer outra
-- exclusao de lead hoje. Nao mexe em clientes_crm/public.clientes (mesmo motivo do
-- comentario em 20261006120000: identidade compartilhada, risco de apagar vinculo real).
alter table gestao_crm.leads
  add column if not exists eh_teste boolean not null default false;

notify pgrst, 'reload schema';
