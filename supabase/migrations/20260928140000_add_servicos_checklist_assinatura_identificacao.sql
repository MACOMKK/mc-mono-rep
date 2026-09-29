-- Identifica quem assinou (nome + vinculo com o cliente titular, e um
-- detalhe livre quando o vinculo for "Terceiro autorizado"/"Outro", ex.:
-- "mae", "motorista contratado") nas assinaturas de entrada/saida do
-- checklist da oficina. Texto livre, sem enum/check no banco -- validacao
-- de opcoes (VINCULO_ASSINANTE) fica no client, mesmo padrao de
-- checklist_fotos.categoria.
alter table gestao_servicos.checklist_avaliacoes
  add column assinatura_entrada_nome text,
  add column assinatura_entrada_vinculo text,
  add column assinatura_entrada_detalhe_vinculo text,
  add column assinatura_saida_nome text,
  add column assinatura_saida_vinculo text,
  add column assinatura_saida_detalhe_vinculo text;

notify pgrst, 'reload schema';
