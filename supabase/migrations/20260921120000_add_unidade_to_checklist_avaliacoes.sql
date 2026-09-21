alter table gestao_servicos.checklist_avaliacoes
  add column if not exists unidade_id uuid references public.unidades(id) on delete set null;

create index if not exists idx_checklist_avaliacoes_unidade_id
  on gestao_servicos.checklist_avaliacoes (unidade_id);
