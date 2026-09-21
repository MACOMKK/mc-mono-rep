-- O wizard de checklist (apps/servicos) travava o inspetor na etapa final: so dava pra "concluir"
-- a avaliacao de entrada exigindo tambem a assinatura de saida do cliente -- mas entrega/saida do
-- veiculo acontece depois, fisicamente, nao no mesmo momento da inspecao. Esse status novo
-- ('avaliado') separa "inspecao de entrada concluida" de "veiculo entregue" (status 'finalizado',
-- que continua exigindo assinatura de saida via checklist_finalizar).

alter table gestao_servicos.checklist_avaliacoes
  drop constraint if exists checklist_avaliacoes_status_check;

alter table gestao_servicos.checklist_avaliacoes
  add constraint checklist_avaliacoes_status_check
  check (status in ('em_andamento', 'avaliado', 'finalizado'));

notify pgrst, 'reload schema';
