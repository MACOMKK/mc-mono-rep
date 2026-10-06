-- Flag "eh_teste" em public.clientes, public.veiculos e gestao_crm.propostas, mesmo
-- padrao ja usado em gestao_servicos.checklist_avaliacoes.eh_teste e
-- gestao_servicos.solicitacoes_pagamento.eh_teste: so admin/gestor pode marcar na criacao.
--
-- Diferente do checklist, a exclusao de cliente/veiculo (cliente_excluir/veiculo_excluir
-- em servicos-oficina-api) NAO fica condicionada a eh_teste=true -- essas actions ja sao
-- admin-only e ja exigem ausencia de vinculos, entao gatear por eh_teste mudaria o
-- comportamento hoje usado por admins para corrigir cadastros reais sem vinculo. A coluna
-- aqui serve so para marcar/filtrar (badge "Teste"), nao para liberar a exclusao.
--
-- Propostas sao diferentes: nao existe hoje exclusao segura de proposta (so o `delete`
-- generico do crm-api, sem gate algum) -- ver proposta_excluir_teste, que DEPENDE desta
-- coluna ser true.
alter table public.clientes
  add column if not exists eh_teste boolean not null default false;

alter table public.veiculos
  add column if not exists eh_teste boolean not null default false;

alter table gestao_crm.propostas
  add column if not exists eh_teste boolean not null default false;

notify pgrst, 'reload schema';
