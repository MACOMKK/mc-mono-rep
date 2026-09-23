-- Historico de eventos do checklist (Oficina), mesmo padrao ja usado pelo
-- Financeiro em gestao_servicos.historico_solicitacao (ver
-- 20260805150000_add_servicos_financeiro_parcelamento_anexos.sql). Cobre a
-- lacuna de auditoria do modulo: nao havia nenhum registro de quando um
-- checklist muda de status nem de quando um link publico e gerado/acessado.

create table if not exists gestao_servicos.historico_checklist (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references gestao_servicos.checklist_avaliacoes(id) on delete cascade,
  evento text not null,
  autor_id uuid references public.colaboradores(id) on delete set null,
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_servicos_historico_checklist_id
  on gestao_servicos.historico_checklist (checklist_id, criado_em desc);

alter table gestao_servicos.historico_checklist enable row level security;

-- Sem hierarquia de aprovacao no Oficina (diferente do Financeiro) -- reusa a
-- mesma regra ja aplicada a checklist_avaliacoes: qualquer papel != 'nenhum'
-- no modulo pode ver, e inserir evento proprio.
drop policy if exists "servicos_oficina_historico_checklist_select" on gestao_servicos.historico_checklist;
create policy "servicos_oficina_historico_checklist_select" on gestao_servicos.historico_checklist
for select to authenticated using (public.servicos_oficina_pode_ver());

drop policy if exists "servicos_oficina_historico_checklist_insert" on gestao_servicos.historico_checklist;
create policy "servicos_oficina_historico_checklist_insert" on gestao_servicos.historico_checklist
for insert to authenticated with check (public.servicos_oficina_pode_ver());

grant select, insert on gestao_servicos.historico_checklist to authenticated, service_role;

notify pgrst, 'reload schema';
