-- Flag "eh_teste" no checklist da Oficina, mesmo padrao ja usado em
-- gestao_servicos.solicitacoes_pagamento (Financeiro): so admin pode marcar na criacao, e libera
-- a exclusao definitiva do checklist (acao checklist_excluir em servicos-oficina-api) sem deixar
-- rastro no fluxo real.
alter table gestao_servicos.checklist_avaliacoes
  add column if not exists eh_teste boolean not null default false;
