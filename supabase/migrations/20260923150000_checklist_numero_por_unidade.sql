-- Numeracao do checklist passa a ser por unidade (ex.: Belem N1, Ananindeua N1)
-- em vez de uma sequence global unica. O calculo do proximo numero passa pro
-- backend (checklist_iniciar em servicos-oficina-api), dentro de uma
-- transacao com advisory lock por unidade -- essa constraint e a rede de
-- seguranca contra qualquer insercao concorrente/fora desse caminho.

alter table gestao_servicos.checklist_avaliacoes
  alter column numero drop default;

alter table gestao_servicos.checklist_avaliacoes
  add constraint checklist_avaliacoes_unidade_numero_unique unique (unidade_id, numero);

-- unidade_id passa a ser obrigatoria (a numeracao por unidade depende disso).
-- So aplica o not null se nao houver nenhum checklist sem unidade hoje --
-- caso existam checklists de teste sem unidade, apague-os antes de rodar
-- esta migration (ou rode manualmente o UPDATE necessario).
do $$
begin
  if not exists (
    select 1 from gestao_servicos.checklist_avaliacoes where unidade_id is null
  ) then
    alter table gestao_servicos.checklist_avaliacoes
      alter column unidade_id set not null;
  else
    raise notice 'Existem checklist_avaliacoes com unidade_id nulo -- unidade_id NAO foi marcada como NOT NULL. Ajuste os registros e rode "alter table gestao_servicos.checklist_avaliacoes alter column unidade_id set not null;" manualmente.';
  end if;
end $$;

notify pgrst, 'reload schema';
