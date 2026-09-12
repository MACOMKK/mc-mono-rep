-- Motivos estruturados exigidos para avancar um lead para qualificado, negociacao,
-- convertido ou perdido. Substitui a checagem antiga (so perdido, texto livre) por um
-- catalogo reaproveitavel (mesmo molde de gestao_crm.origens_lead), com enforcement
-- no trigger gestao_crm.prepare_lead_phase1() para nao ser contornavel via API direta.

create table if not exists gestao_crm.motivos_status (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('qualificado', 'convertido', 'perdido')),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (status, nome)
);

drop trigger if exists trg_crm_motivos_status_set_updated_at on gestao_crm.motivos_status;
create trigger trg_crm_motivos_status_set_updated_at
before update on gestao_crm.motivos_status
for each row execute function public.set_updated_at();

alter table gestao_crm.motivos_status enable row level security;

drop policy if exists "crm_motivos_status_select" on gestao_crm.motivos_status;
create policy "crm_motivos_status_select" on gestao_crm.motivos_status
for select to authenticated using (public.crm_has_access());

drop policy if exists "crm_motivos_status_manage" on gestao_crm.motivos_status;
create policy "crm_motivos_status_manage" on gestao_crm.motivos_status
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on gestao_crm.motivos_status to authenticated, service_role;

alter table gestao_crm.motivos_status replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'motivos_status'
  ) then
    alter publication supabase_realtime add table gestao_crm.motivos_status;
  end if;
end
$$;

alter table gestao_crm.leads
  add column if not exists motivo_status_id uuid references gestao_crm.motivos_status(id);

create index if not exists idx_crm_leads_motivo_status_id on gestao_crm.leads (motivo_status_id);

-- gestao_crm.leads.motivo_perda (texto livre) e mantido: passa a ser um detalhe
-- complementar opcional, nao mais a unica fonte de justificativa. A exigencia real
-- (motivo_status_id do catalogo, valido para o status de destino) vira regra do
-- trigger abaixo, junto com a nova exigencia de previsao_fechamento para negociacao.

create or replace function gestao_crm.prepare_lead_phase1()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  assigned_collaborator_id uuid;
  distribution_config gestao_crm.configuracoes_distribuicao%rowtype;
  manual_responsavel_unidade_id uuid;
  sla_minutes integer := 30;
  has_active_seller boolean;
  status_label text;
  motivo_status_ok boolean;
begin
  status_label := case new.status
    when 'novo' then 'Novo'
    when 'tentativa_contato' then 'Tentativa de contato'
    when 'em_contato' then 'Em contato'
    when 'qualificado' then 'Qualificado'
    when 'negociacao' then 'Negociacao'
    when 'convertido' then 'Convertido'
    when 'perdido' then 'Perdido'
    else new.status
  end;

  if new.status in ('qualificado', 'convertido', 'perdido') then
    if new.motivo_status_id is null then
      raise exception using errcode = '23514', message = format('Selecione um motivo para mover o lead para %s.', status_label);
    end if;

    select exists (
      select 1 from gestao_crm.motivos_status m
      where m.id = new.motivo_status_id and m.status = new.status and m.ativo
    ) into motivo_status_ok;

    if not motivo_status_ok then
      raise exception using errcode = '23514', message = format('O motivo selecionado nao e valido para o status %s.', status_label);
    end if;
  else
    new.motivo_status_id = null;
  end if;

  if new.status = 'negociacao' and new.previsao_fechamento is null then
    raise exception using errcode = '23514', message = 'Informe a previsao de fechamento para mover o lead para negociacao.';
  end if;

  if new.status <> 'perdido' then
    new.motivo_perda = null;
    new.perdido_em = null;
  elsif new.perdido_em is null then
    new.perdido_em = now();
  end if;

  if new.status = 'convertido' and new.convertido_em is null then
    new.convertido_em = now();
  elsif new.status <> 'convertido' then
    new.convertido_em = null;
  end if;

  if new.unidade_id is null then
    select u.id into new.unidade_id
    from public.unidades u
    where (lower(new.empresa) like '%ananindeua%' and lower(u.nome) like '%ananindeua%')
       or (lower(new.empresa) like '%bel%' and lower(u.nome) like '%bel%')
       or (lower(new.empresa) like '%paragominas%' and lower(u.nome) like '%paragominas%')
    order by u.nome
    limit 1;
  end if;

  if new.unidade_id is null then
    raise exception using errcode = '23514', message = 'Unidade do lead e obrigatoria para distribuicao.';
  end if;

  select * into distribution_config
  from gestao_crm.configuracoes_distribuicao
  where unidade_id = new.unidade_id;

  sla_minutes = coalesce(distribution_config.sla_primeiro_contato_minutos, 30);

  if new.responsavel_id is not null then
    select c.unidade_id into manual_responsavel_unidade_id
    from public.colaboradores c
    join public.acessos_usuario_sistema aus on aus.colaborador_id = c.id and aus.ativo = true
    join public.sistemas s on s.id = aus.sistema_id and s.slug = 'crm' and s.ativo = true
    where c.id = new.responsavel_id and c.status <> 'inativo';

    if manual_responsavel_unidade_id is null or manual_responsavel_unidade_id <> new.unidade_id then
      raise exception using errcode = '23514', message = 'Responsavel deve possuir acesso ao CRM e pertencer a unidade do lead.';
    end if;
  end if;

  if tg_op = 'INSERT' and new.responsavel_id is null then
    perform pg_advisory_xact_lock(hashtextextended(new.unidade_id::text, 0));

    if distribution_config.ativa then
      if distribution_config.estrategia = 'rodizio' then
        select vd.colaborador_id into assigned_collaborator_id
        from gestao_crm.vendedores_distribuicao vd
        join public.colaboradores c on c.id = vd.colaborador_id
        left join gestao_crm.leads active_lead
          on active_lead.responsavel_id = vd.colaborador_id
         and active_lead.status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao')
        where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        group by vd.colaborador_id, vd.ultimo_lead_atribuido_em, vd.limite_leads_ativos
        having count(active_lead.id) < coalesce(vd.limite_leads_ativos, distribution_config.limite_padrao_leads_ativos, 2147483647)
        order by vd.ultimo_lead_atribuido_em nulls first, vd.colaborador_id
        limit 1;
      else
        select vd.colaborador_id into assigned_collaborator_id
        from gestao_crm.vendedores_distribuicao vd
        join public.colaboradores c on c.id = vd.colaborador_id
        left join gestao_crm.leads active_lead
          on active_lead.responsavel_id = vd.colaborador_id
         and active_lead.status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao')
        where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        group by vd.colaborador_id, vd.ultimo_lead_atribuido_em, vd.limite_leads_ativos
        having count(active_lead.id) < coalesce(vd.limite_leads_ativos, distribution_config.limite_padrao_leads_ativos, 2147483647)
        order by count(active_lead.id), vd.ultimo_lead_atribuido_em nulls first, vd.colaborador_id
        limit 1;
      end if;

      if assigned_collaborator_id is null then
        select exists (
          select 1
          from gestao_crm.vendedores_distribuicao vd
          join public.colaboradores c on c.id = vd.colaborador_id
          where vd.unidade_id = new.unidade_id and vd.ativo and c.status <> 'inativo'
        ) into has_active_seller;

        if has_active_seller then
          raise exception using errcode = '23514', message = 'Todos os vendedores ativos desta unidade atingiram o limite de leads ativos.';
        else
          raise exception using errcode = '23514', message = 'Nenhum vendedor ativo nesta unidade para distribuicao automatica.';
        end if;
      end if;

      new.responsavel_id = assigned_collaborator_id;
      update gestao_crm.vendedores_distribuicao
      set ultimo_lead_atribuido_em = now()
      where unidade_id = new.unidade_id and colaborador_id = assigned_collaborator_id;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.atribuido_em = case when new.responsavel_id is null then null else now() end;
  elsif new.responsavel_id is distinct from old.responsavel_id then
    new.atribuido_em = case when new.responsavel_id is null then null else now() end;
  end if;

  if new.sla_primeiro_contato_em is null then
    new.sla_primeiro_contato_em = coalesce(new.criado_em, now()) + make_interval(mins => sla_minutes);
  end if;

  return new;
end;
$$;

grant execute on function gestao_crm.prepare_lead_phase1() to authenticated, service_role;

notify pgrst, 'reload schema';
