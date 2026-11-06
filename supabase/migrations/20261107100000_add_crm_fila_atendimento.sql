-- Fila/distribuicao automatica de conversas entre atendentes (Fase 1, item 5 do roadmap de
-- Atendimento). Espelha o padrao de configuracoes_distribuicao/vendedores_distribuicao (leads),
-- mas e' global (sem unidade_id): uma conversa nova pode nao ter lead/cliente vinculado ainda,
-- logo nao ha unidade pra filtrar a fila por. Ver prepare_lead_phase1() para o padrao original.
-- Diferente de leads: sem atendente elegivel nao bloqueia o insert (webhook do WhatsApp nao pode
-- falhar), a conversa so fica sem atendente_id ate alguem assumir/transferir manualmente.

create table gestao_crm.configuracao_fila_atendimento (
  id boolean primary key default true check (id),
  ativa boolean not null default true,
  estrategia text not null default 'rodizio' check (estrategia in ('rodizio', 'menor_carga')),
  limite_padrao_conversas_ativas integer
    check (limite_padrao_conversas_ativas is null or limite_padrao_conversas_ativas > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
insert into gestao_crm.configuracao_fila_atendimento (id) values (true);

create table gestao_crm.atendentes_fila (
  colaborador_id uuid primary key references public.colaboradores(id) on delete cascade,
  ativo boolean not null default true,
  limite_conversas_ativas integer check (limite_conversas_ativas is null or limite_conversas_ativas > 0),
  ultimo_atendimento_atribuido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index idx_crm_atendentes_fila_elegiveis
  on gestao_crm.atendentes_fila (ativo, ultimo_atendimento_atribuido_em);

alter table gestao_crm.configuracao_fila_atendimento enable row level security;
alter table gestao_crm.atendentes_fila enable row level security;

drop policy if exists "crm_fila_atendimento_select" on gestao_crm.configuracao_fila_atendimento;
create policy "crm_fila_atendimento_select" on gestao_crm.configuracao_fila_atendimento
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_fila_atendimento_manage" on gestao_crm.configuracao_fila_atendimento;
create policy "crm_fila_atendimento_manage" on gestao_crm.configuracao_fila_atendimento
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_atendentes_fila_select" on gestao_crm.atendentes_fila;
create policy "crm_atendentes_fila_select" on gestao_crm.atendentes_fila
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_atendentes_fila_manage" on gestao_crm.atendentes_fila;
create policy "crm_atendentes_fila_manage" on gestao_crm.atendentes_fila
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.configuracao_fila_atendimento to authenticated, service_role;
grant select, insert, update, delete on gestao_crm.atendentes_fila to authenticated, service_role;

drop trigger if exists trg_crm_configuracao_fila_atendimento_set_updated_at on gestao_crm.configuracao_fila_atendimento;
create trigger trg_crm_configuracao_fila_atendimento_set_updated_at
before update on gestao_crm.configuracao_fila_atendimento
for each row
execute function public.set_updated_at();

drop trigger if exists trg_crm_atendentes_fila_set_updated_at on gestao_crm.atendentes_fila;
create trigger trg_crm_atendentes_fila_set_updated_at
before update on gestao_crm.atendentes_fila
for each row
execute function public.set_updated_at();

create or replace function gestao_crm.prepare_conversa_atendimento()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  config gestao_crm.configuracao_fila_atendimento%rowtype;
  assigned_collaborator_id uuid;
  assigned_nome text;
begin
  if new.atendente_id is not null then
    return new;
  end if;

  select * into config from gestao_crm.configuracao_fila_atendimento where id = true;

  if not config.ativa then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('fila_atendimento'));

  if config.estrategia = 'rodizio' then
    select af.colaborador_id into assigned_collaborator_id
    from gestao_crm.atendentes_fila af
    join public.colaboradores c on c.id = af.colaborador_id
    left join gestao_crm.conversas_atendimento ativa
      on ativa.atendente_id = af.colaborador_id
     and ativa.status in ('aberta', 'aguardando_humano')
    where af.ativo and c.status <> 'inativo'
    group by af.colaborador_id, af.ultimo_atendimento_atribuido_em, af.limite_conversas_ativas
    having count(ativa.id) < coalesce(af.limite_conversas_ativas, config.limite_padrao_conversas_ativas, 2147483647)
    order by af.ultimo_atendimento_atribuido_em nulls first, af.colaborador_id
    limit 1;
  else
    select af.colaborador_id into assigned_collaborator_id
    from gestao_crm.atendentes_fila af
    join public.colaboradores c on c.id = af.colaborador_id
    left join gestao_crm.conversas_atendimento ativa
      on ativa.atendente_id = af.colaborador_id
     and ativa.status in ('aberta', 'aguardando_humano')
    where af.ativo and c.status <> 'inativo'
    group by af.colaborador_id, af.ultimo_atendimento_atribuido_em, af.limite_conversas_ativas
    having count(ativa.id) < coalesce(af.limite_conversas_ativas, config.limite_padrao_conversas_ativas, 2147483647)
    order by count(ativa.id), af.ultimo_atendimento_atribuido_em nulls first, af.colaborador_id
    limit 1;
  end if;

  if assigned_collaborator_id is null then
    return new;
  end if;

  select nome into assigned_nome from public.colaboradores where id = assigned_collaborator_id;

  new.atendente_id = assigned_collaborator_id;

  update gestao_crm.atendentes_fila
  set ultimo_atendimento_atribuido_em = now()
  where colaborador_id = assigned_collaborator_id;

  insert into gestao_crm.notas_conversa (conversa_id, colaborador_id, conteudo, tipo)
  values (new.id, null, format('Conversa atribuida automaticamente a %s.', coalesce(assigned_nome, 'um atendente')), 'sistema');

  return new;
end;
$$;

drop trigger if exists trg_crm_conversas_atendimento_fila on gestao_crm.conversas_atendimento;
create trigger trg_crm_conversas_atendimento_fila
before insert on gestao_crm.conversas_atendimento
for each row
execute function gestao_crm.prepare_conversa_atendimento();

notify pgrst, 'reload schema';
