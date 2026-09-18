-- Migra as fotos do checklist de Oficina do jsonb `checklist_avaliacoes.fotos`
-- para uma tabela propria, mesmo padrao de checklist_itens/checklist_avarias
-- (20260917020000). Feito ainda em fase de teste do modulo (sem uso em
-- producao) para evitar de carregar esse formato adiante: jsonb aqui nao tem
-- unique constraint em storage_path, nao suporta update atomico de 1 foto
-- (toda edicao reescreve o array inteiro -- risco de race condition entre
-- dois updates concorrentes) e nao permite FK/index nativos.

create table if not exists gestao_servicos.checklist_fotos (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references gestao_servicos.checklist_avaliacoes(id) on delete cascade,
  storage_path text not null unique,
  categoria text,
  legenda text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_checklist_fotos_avaliacao_id
  on gestao_servicos.checklist_fotos (avaliacao_id);

-- Migra dados existentes (se houver, de testes manuais em ambiente ainda nao
-- produtivo) antes de remover a coluna jsonb. `jsonb_array_elements` explode
-- se `fotos` nao for um array de fato -- algumas linhas antigas tem `fotos`
-- salvo como escalar (resquicio do bug de serializacao jsonb ja corrigido no
-- backend), entao filtra por jsonb_typeof antes de tentar iterar.
insert into gestao_servicos.checklist_fotos (avaliacao_id, storage_path, categoria, legenda)
select
  ca.id,
  foto->>'storage_path',
  foto->>'categoria',
  foto->>'legenda'
from gestao_servicos.checklist_avaliacoes ca
cross join lateral jsonb_array_elements(ca.fotos) as foto
where jsonb_typeof(ca.fotos) = 'array'
  and foto->>'storage_path' is not null
on conflict (storage_path) do nothing;

alter table gestao_servicos.checklist_avaliacoes drop column if exists fotos;

alter table gestao_servicos.checklist_fotos enable row level security;

drop policy if exists "servicos_oficina_checklist_fotos_select" on gestao_servicos.checklist_fotos;
create policy "servicos_oficina_checklist_fotos_select" on gestao_servicos.checklist_fotos
for select to authenticated using (public.servicos_oficina_pode_ver());

drop policy if exists "servicos_oficina_checklist_fotos_write" on gestao_servicos.checklist_fotos;
create policy "servicos_oficina_checklist_fotos_write" on gestao_servicos.checklist_fotos
for all to authenticated
using (public.servicos_oficina_pode_editar())
with check (public.servicos_oficina_pode_editar());

grant select, insert, update, delete
  on gestao_servicos.checklist_fotos
  to authenticated, service_role;

notify pgrst, 'reload schema';
