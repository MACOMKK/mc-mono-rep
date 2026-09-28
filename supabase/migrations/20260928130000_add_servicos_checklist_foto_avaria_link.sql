-- Permite vincular uma foto (checklist_fotos) a uma avaria especifica
-- (checklist_avarias) -- usado pelo fluxo de "amassado" no diagrama, que
-- sugere tirar uma foto do ponto marcado. on delete set null (nao cascade):
-- remover a marca de avaria nao deve apagar uma foto ja enviada, so
-- desvincular.
alter table gestao_servicos.checklist_fotos
  add column avaria_id uuid references gestao_servicos.checklist_avarias(id) on delete set null;

create index idx_checklist_fotos_avaria_id on gestao_servicos.checklist_fotos(avaria_id);
