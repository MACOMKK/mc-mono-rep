-- Card "Nota interna própria da conversa" (Fase 1 do roadmap de Atendimento): hoje a nota
-- interna grava em gestao_crm.leads.observacoes, o que não serve para conversa sem lead ou
-- vinculada só a cliente (pós-venda). Histórico cumulativo, write-once -- não substitui a
-- observação do lead.

create table gestao_crm.notas_conversa (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references gestao_crm.conversas_atendimento(id) on delete cascade,
  colaborador_id uuid references public.colaboradores(id),
  conteudo text not null,
  criado_em timestamptz not null default now()
);

create index idx_crm_notas_conversa_conversa_id on gestao_crm.notas_conversa(conversa_id);

notify pgrst, 'reload schema';
