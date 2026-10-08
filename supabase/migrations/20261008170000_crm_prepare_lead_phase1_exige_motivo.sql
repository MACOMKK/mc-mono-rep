-- Fase 2.7 (passo 2d/5) do PLANO_LEADS_PIPELINE.local.md: motivo obrigatorio ao mover o lead
-- (Kanban/LeadForm) passa a ler etapas_pipeline.exige_motivo em vez de assumir sempre a etapa
-- chave_sistema='qualificado'. Etapas tipo ganho/perdido continuam exigindo motivo sempre, sem
-- depender do flag (nao e configuravel). Resto da funcao sem mudanca.

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
  etapa_atual record;
  etapa_mudou boolean;
  motivo_aplica_em text;
  motivo_status_ok boolean;
begin
  select e.nome, e.tipo, e.chave_sistema, e.exige_motivo
  into etapa_atual
  from gestao_crm.etapas_pipeline e
  where e.id = new.etapa_id;

  if not found then
    raise exception using errcode = '23503', message = 'Etapa do pipeline nao encontrada.';
  end if;

  etapa_mudou := tg_op = 'INSERT' or new.etapa_id is distinct from old.etapa_id;

  if etapa_atual.tipo = 'ganho'
     and (tg_op = 'INSERT' or old.etapa_tipo is distinct from 'ganho')
     and coalesce(current_setting('gestao_crm.allow_convertido', true), '') <> 'on' then
    raise exception using
      errcode = '23514',
      message = 'Lead so pode ser convertido ao aceitar uma proposta ou fechar uma venda.';
  end if;

  motivo_aplica_em := case
    when etapa_atual.tipo in ('ganho', 'perdido') then etapa_atual.tipo
    when etapa_atual.exige_motivo then 'qualificado'
  end;

  if motivo_aplica_em is null then
    new.motivo_status_id = null;
  elsif etapa_mudou or new.motivo_status_id is distinct from old.motivo_status_id then
    if new.motivo_status_id is null then
      raise exception using errcode = '23514', message = format('Selecione um motivo para mover o lead para %s.', etapa_atual.nome);
    end if;

    select exists (
      select 1 from gestao_crm.motivos_status m
      where m.id = new.motivo_status_id and m.aplica_em = motivo_aplica_em and m.ativo
    ) into motivo_status_ok;

    if not motivo_status_ok then
      raise exception using errcode = '23514', message = format('O motivo selecionado nao e valido para a etapa %s.', etapa_atual.nome);
    end if;
  end if;

  if etapa_atual.tipo <> 'perdido' then
    new.motivo_perda = null;
    new.perdido_em = null;
  elsif new.perdido_em is null then
    new.perdido_em = now();
  end if;

  if etapa_atual.tipo = 'ganho' and new.convertido_em is null then
    new.convertido_em = now();
  elsif etapa_atual.tipo <> 'ganho' then
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
         and active_lead.etapa_tipo = 'em_andamento'
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
         and active_lead.etapa_tipo = 'em_andamento'
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

comment on function gestao_crm.prepare_lead_phase1() is
  'Regras do lead pela etapa (etapas_pipeline.tipo/exige_motivo): motivo obrigatorio na etapa com '
  'exige_motivo=true e nas etapas tipo ganho/perdido (validado contra motivos_status.aplica_em, so '
  'quando a etapa ou o motivo mudam); entrar em etapa tipo ganho so com '
  'gestao_crm.allow_convertido = on (setada por apply_venda_outcome() e pelo branch venda_realizada '
  'de apply_activity_outcome()); perdido_em/convertido_em pelo tipo; distribuicao por carga de leads '
  'com etapa_tipo em_andamento. Roda depois de trg_crm_leads_a_sync_etapa, que ja deixa '
  'etapa_id/etapa_tipo coerentes com status. Mantenha em sincronia com apply_activity_outcome(), '
  'prepare_activity_business_state() e apps/crm/src/lib/leadStatus.js. A sincronizacao do cliente '
  'fica em sync_cliente_status_relacionamento() -- nao replique esse UPDATE aqui.';

notify pgrst, 'reload schema';
