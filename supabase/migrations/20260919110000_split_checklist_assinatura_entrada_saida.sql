-- Separa a assinatura unica do checklist da oficina em entrada/saida.
-- Ver apps/servicos/CLAUDE.md (secao Oficina) para contexto do checklist.
alter table gestao_servicos.checklist_avaliacoes
  rename column assinatura_cliente to assinatura_entrada;

alter table gestao_servicos.checklist_avaliacoes
  add column assinatura_saida text;

notify pgrst, 'reload schema';
