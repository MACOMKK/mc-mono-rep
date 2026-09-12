-- Pipelines configuraveis (fase 1): tabelas novas e isoladas, sem alterar
-- gestao_crm.leads/status. O Kanban de leads continua usando o status atual;
-- isso e so a fundacao de dados + tela de configuracao de pipelines/etapas.

create table if not exists gestao_crm.pipelines (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  padrao boolean not null default false,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists gestao_crm.etapas_pipeline (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references gestao_crm.pipelines(id) on delete cascade,
  nome text not null,
  cor text not null default '#90CAF9',
  ordem integer not null default 0,
  chave_sistema text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pipeline_id, ordem),
  unique (pipeline_id, chave_sistema)
);

drop trigger if exists trg_crm_pipelines_set_updated_at on gestao_crm.pipelines;
create trigger trg_crm_pipelines_set_updated_at
before update on gestao_crm.pipelines
for each row execute function public.set_updated_at();

drop trigger if exists trg_crm_etapas_pipeline_set_updated_at on gestao_crm.etapas_pipeline;
create trigger trg_crm_etapas_pipeline_set_updated_at
before update on gestao_crm.etapas_pipeline
for each row execute function public.set_updated_at();

-- Trava de etapas/pipeline "de sistema": nome e cor continuam editaveis, mas
-- nao e possivel apagar, nem mover para outro pipeline, nem remover a chave
-- de uma etapa de sistema; e nao e possivel apagar o pipeline padrao.
create or replace function gestao_crm.protect_crm_pipeline_sistema()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'pipelines' and tg_op = 'DELETE' and old.padrao then
    raise exception using errcode = '23514', message = 'O pipeline padrao nao pode ser excluido.';
  end if;

  if tg_table_name = 'etapas_pipeline' and old.chave_sistema is not null then
    if tg_op = 'DELETE' then
      raise exception using errcode = '23514', message = 'Etapas de sistema nao podem ser excluidas.';
    end if;
    if tg_op = 'UPDATE' and (
      new.pipeline_id is distinct from old.pipeline_id
      or new.chave_sistema is distinct from old.chave_sistema
    ) then
      raise exception using errcode = '23514', message = 'Etapas de sistema nao podem trocar de pipeline ou perder sua chave.';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_crm_pipelines_protect_sistema on gestao_crm.pipelines;
create trigger trg_crm_pipelines_protect_sistema
before delete on gestao_crm.pipelines
for each row execute function gestao_crm.protect_crm_pipeline_sistema();

drop trigger if exists trg_crm_etapas_pipeline_protect_sistema on gestao_crm.etapas_pipeline;
create trigger trg_crm_etapas_pipeline_protect_sistema
before update or delete on gestao_crm.etapas_pipeline
for each row execute function gestao_crm.protect_crm_pipeline_sistema();

alter table gestao_crm.pipelines enable row level security;
alter table gestao_crm.etapas_pipeline enable row level security;

drop policy if exists "crm_pipelines_select" on gestao_crm.pipelines;
create policy "crm_pipelines_select" on gestao_crm.pipelines
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_pipelines_manage" on gestao_crm.pipelines;
create policy "crm_pipelines_manage" on gestao_crm.pipelines
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_etapas_pipeline_select" on gestao_crm.etapas_pipeline;
create policy "crm_etapas_pipeline_select" on gestao_crm.etapas_pipeline
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_etapas_pipeline_manage" on gestao_crm.etapas_pipeline;
create policy "crm_etapas_pipeline_manage" on gestao_crm.etapas_pipeline
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.pipelines to authenticated, service_role;
grant select, insert, update, delete on gestao_crm.etapas_pipeline to authenticated, service_role;

-- Seed: pipeline "Comercial" espelhando o funil de leads atual (mesmas cores
-- do Kanban), so como dado — nao muda nada em gestao_crm.leads.
insert into gestao_crm.pipelines (nome, padrao)
values ('Comercial', true)
on conflict (nome) do nothing;

insert into gestao_crm.etapas_pipeline (pipeline_id, nome, cor, ordem, chave_sistema)
select p.id, etapa.nome, etapa.cor, etapa.ordem, etapa.chave_sistema
from gestao_crm.pipelines p
cross join (
  values
    ('Novo', '#3b82f6', 1, 'novo'),
    ('Tentativa de contato', '#fbbf24', 2, 'tentativa_contato'),
    ('Em contato', '#06b6d4', 3, 'em_contato'),
    ('Qualificado', '#8b5cf6', 4, 'qualificado'),
    ('Negociação', '#f97316', 5, 'negociacao'),
    ('Convertido', '#16a34a', 6, 'convertido'),
    ('Perdido', '#dc2626', 7, 'perdido')
) as etapa(nome, cor, ordem, chave_sistema)
where p.nome = 'Comercial'
on conflict (pipeline_id, chave_sistema) do nothing;

alter table gestao_crm.pipelines replica identity full;
alter table gestao_crm.etapas_pipeline replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'gestao_crm' and tablename = 'pipelines'
  ) then
    alter publication supabase_realtime add table gestao_crm.pipelines;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'gestao_crm' and tablename = 'etapas_pipeline'
  ) then
    alter publication supabase_realtime add table gestao_crm.etapas_pipeline;
  end if;
end
$$;

notify pgrst, 'reload schema';
