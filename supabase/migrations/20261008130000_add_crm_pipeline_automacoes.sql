-- Fase 2.7 (passo 1/5) do PLANO_LEADS_PIPELINE.local.md: regras configuráveis por pipeline/etapa
-- em vez de amarradas à chave_sistema. Esta migration só cria o schema (colunas + tabela) e
-- faz o backfill do pipeline Comercial a partir das regras que ele já segue hoje -- nenhum
-- trigger de negócio é alterado aqui (isso é o passo 2, em migrations separadas).

alter table gestao_crm.etapas_pipeline
  add column if not exists exige_motivo boolean not null default false;

alter table gestao_crm.pipelines
  add column if not exists etapa_inicial_id uuid references gestao_crm.etapas_pipeline(id),
  add column if not exists etapa_cancelamento_id uuid references gestao_crm.etapas_pipeline(id);

create table if not exists gestao_crm.pipeline_automacoes (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references gestao_crm.pipelines(id) on delete cascade,
  resultado text not null,
  etapa_destino_id uuid not null references gestao_crm.etapas_pipeline(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (pipeline_id, resultado)
);

drop trigger if exists trg_crm_pipeline_automacoes_set_updated_at on gestao_crm.pipeline_automacoes;
create trigger trg_crm_pipeline_automacoes_set_updated_at
before update on gestao_crm.pipeline_automacoes
for each row execute function public.set_updated_at();

alter table gestao_crm.pipeline_automacoes enable row level security;

drop policy if exists "crm_pipeline_automacoes_select" on gestao_crm.pipeline_automacoes;
create policy "crm_pipeline_automacoes_select" on gestao_crm.pipeline_automacoes
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_pipeline_automacoes_manage" on gestao_crm.pipeline_automacoes;
create policy "crm_pipeline_automacoes_manage" on gestao_crm.pipeline_automacoes
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.pipeline_automacoes to authenticated, service_role;

-- Trava: a etapa destino de uma automação precisa pertencer ao mesmo pipeline da automação
-- (mesmo padrão de gestao_crm.validate_etapa_pipeline_leads, mas simples o bastante para caber
-- aqui como CHECK via trigger em vez de uma função nova).
create or replace function gestao_crm.validate_crm_pipeline_automacao()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from gestao_crm.etapas_pipeline e
    where e.id = new.etapa_destino_id and e.pipeline_id = new.pipeline_id
  ) then
    raise exception using errcode = '23514', message = 'A etapa destino nao pertence a este pipeline.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_pipeline_automacoes_validate on gestao_crm.pipeline_automacoes;
create trigger trg_crm_pipeline_automacoes_validate
before insert or update on gestao_crm.pipeline_automacoes
for each row execute function gestao_crm.validate_crm_pipeline_automacao();

-- Backfill: etapa que exige motivo hoje (chave_sistema='qualificado' -- ganho/perdido já exigem
-- motivo sempre, por `tipo`, independente deste flag).
update gestao_crm.etapas_pipeline
set exige_motivo = true
where chave_sistema = 'qualificado';

-- Backfill: etapa inicial (hoje sempre chave_sistema='novo') e etapa de cancelamento de venda
-- (hoje sempre chave_sistema='negociacao') de qualquer pipeline que já tenha essas etapas de
-- sistema (só o Comercial, hoje).
update gestao_crm.pipelines p
set etapa_inicial_id = (
      select e.id from gestao_crm.etapas_pipeline e
      where e.pipeline_id = p.id and e.chave_sistema = 'novo'
    ),
    etapa_cancelamento_id = (
      select e.id from gestao_crm.etapas_pipeline e
      where e.pipeline_id = p.id and e.chave_sistema = 'negociacao'
    )
where exists (
  select 1 from gestao_crm.etapas_pipeline e
  where e.pipeline_id = p.id and e.chave_sistema = 'novo'
);

-- Backfill: automações por resultado de atividade, replicando o mapa hoje hardcoded em
-- gestao_crm.apply_activity_outcome() / apps/crm/src/lib/leadStatus.js (RESULTADO_ETAPA_CHAVE).
-- venda_realizada/lead_perdido ficam fora -- continuam resolvidos por tipo ganho/perdido, sem
-- depender de automação configurável.
insert into gestao_crm.pipeline_automacoes (pipeline_id, resultado, etapa_destino_id)
select e.pipeline_id, r.resultado, e.id
from gestao_crm.etapas_pipeline e
join (
  values
    ('contato_realizado', 'em_contato'),
    ('sem_resposta', 'tentativa_contato'),
    ('visita_agendada', 'qualificado'),
    ('test_drive', 'qualificado'),
    ('proposta_enviada', 'negociacao')
) as r(resultado, chave_sistema) on r.chave_sistema = e.chave_sistema
on conflict (pipeline_id, resultado) do nothing;

alter table gestao_crm.pipeline_automacoes replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'gestao_crm' and tablename = 'pipeline_automacoes'
  ) then
    alter publication supabase_realtime add table gestao_crm.pipeline_automacoes;
  end if;
end
$$;

notify pgrst, 'reload schema';
