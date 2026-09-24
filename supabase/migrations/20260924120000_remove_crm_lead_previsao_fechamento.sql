-- Remove por completo a regra de negocio em torno de previsao_fechamento no CRM.
-- Decisao do produto: o campo nunca sera usado -- nao faz sentido manter a exigencia de
-- previsao_fechamento para mover um lead para 'negociacao' (regra em prepare_lead_phase1(),
-- introduzida em 20260912140000_add_crm_motivos_status.sql), nem a validacao equivalente ao
-- concluir uma atividade com resultado 'proposta_enviada' (prepare_activity_business_state(),
-- 20260917000000_fix_activity_outcome_lead_status_requirements.sql), nem a propagacao do campo
-- em apply_activity_outcome(), nem a deteccao de mudanca em
-- gestao_crm.register_lead_change_history() (20260909100000_remove_crm_lead_triagem.sql),
-- nem o armazenamento das colunas em gestao_crm.leads e gestao_crm.atendimentos.
--
-- Efeito colateral direto: a action cancel_venda (supabase/functions/crm-api/index.ts) deixa de
-- exigir previsao_fechamento no payload para reabrir um lead em 'negociacao' -- a reabertura
-- passa a ser incondicional quando a venda cancelada tinha o lead em 'convertido'.

drop index if exists gestao_crm.idx_crm_leads_previsao_fechamento;

alter table gestao_crm.leads drop column if exists previsao_fechamento;
alter table gestao_crm.atendimentos drop column if exists previsao_fechamento;

create or replace function gestao_crm.register_lead_change_history()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  history_type text;
  history_description text;
begin
  if new.responsavel_id is distinct from old.responsavel_id then
    history_type = 'atribuicao_lead';
    history_description = case
      when new.responsavel_id is null then 'Responsavel removido do lead.'
      else 'Responsavel do lead alterado.'
    end;
  elsif new.nome is distinct from old.nome
     or new.telefone is distinct from old.telefone
     or new.email is distinct from old.email
     or new.status is distinct from old.status
     or new.modelo_interesse is distinct from old.modelo_interesse
     or new.motivo_perda is distinct from old.motivo_perda
     or new.observacoes is distinct from old.observacoes then
    history_type = 'atualizacao_lead';
    history_description = 'Dados comerciais do lead atualizados.';
  else
    return new;
  end if;

  insert into gestao_crm.historico_atendimentos (
    cliente_id,
    lead_id,
    tipo,
    descricao,
    entidade,
    entidade_id,
    status,
    metadados
  ) values (
    new.cliente_id,
    new.id,
    history_type,
    history_description,
    'Lead',
    new.id,
    new.status,
    jsonb_build_object(
      'antes', to_jsonb(old),
      'depois', to_jsonb(new)
    )
  );

  return new;
end;
$$;

create or replace function gestao_crm.prepare_activity_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  lead_atual_status text;
begin
  select cliente_id
  into linked_client_id
  from gestao_crm.leads
  where id = new.lead_id;

  if linked_client_id is null then
    raise exception using
      errcode = '23503',
      message = 'Lead vinculado a atividade nao foi encontrado.';
  end if;

  new.cliente_id = linked_client_id;

  if tg_op = 'UPDATE'
     and old.status in ('concluida', 'cancelada')
     and new.status is distinct from old.status then
    raise exception using
      errcode = '23514',
      message = 'Atividade encerrada nao pode ser reaberta.';
  end if;

  if new.status = 'planejada' then
    if new.proximo_contato is null then
      raise exception using
        errcode = '23514',
        message = 'Informe a data da atividade planejada.';
    end if;

    new.resultado = null;
    new.motivo_resultado = null;
    new.motivo_status_id = null;
    new.concluido_em = null;
  elsif new.status = 'cancelada' then
    new.resultado = null;
    new.motivo_resultado = null;
    new.motivo_status_id = null;
    new.concluido_em = coalesce(new.concluido_em, now());
  elsif new.status = 'concluida' then
    if new.resultado is null then
      raise exception using
        errcode = '23514',
        message = 'Informe o resultado para concluir a atividade.';
    end if;

    if new.resultado = 'lead_perdido'
       and nullif(trim(coalesce(new.motivo_resultado, '')), '') is null then
      raise exception using
        errcode = '23514',
        message = 'Informe o motivo da perda para concluir a atividade.';
    end if;

    if new.resultado <> 'lead_perdido' then
      new.motivo_resultado = null;
    end if;

    select status into lead_atual_status from gestao_crm.leads where id = new.lead_id;

    if new.resultado in ('venda_realizada', 'lead_perdido')
       or (
         new.resultado in ('visita_agendada', 'test_drive')
         and lead_atual_status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado')
       ) then
      if new.motivo_status_id is null then
        raise exception using
          errcode = '23514',
          message = 'Selecione um motivo para concluir esta atividade.';
      end if;
    end if;

    if new.resultado <> 'venda_realizada'
       and new.resultado <> 'lead_perdido'
       and not (new.resultado in ('visita_agendada', 'test_drive')) then
      new.motivo_status_id = null;
    end if;

    new.concluido_em = coalesce(new.concluido_em, now());
  end if;

  return new;
end;
$$;

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

  if new.status = 'convertido'
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and coalesce(current_setting('gestao_crm.allow_convertido', true), '') <> 'on' then
    raise exception using
      errcode = '23514',
      message = 'Lead so pode ser convertido ao aceitar uma proposta ou fechar uma venda.';
  end if;

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

create or replace function gestao_crm.apply_activity_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if new.status <> 'concluida' then
    return new;
  end if;

  update gestao_crm.leads
  set primeiro_contato_em = case
    when new.resultado <> 'sem_resposta' then coalesce(primeiro_contato_em, now())
    else primeiro_contato_em
  end
  where id = new.lead_id;

  if new.resultado = 'venda_realizada' then
    perform set_config('gestao_crm.allow_convertido', 'on', true);

    update gestao_crm.leads
    set status = 'convertido', motivo_status_id = new.motivo_status_id, convertido_em = coalesce(convertido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'lead_perdido' then
    update gestao_crm.leads
    set status = 'perdido', motivo_status_id = new.motivo_status_id, motivo_perda = new.motivo_resultado, perdido_em = coalesce(perdido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'proposta_enviada' then
    update gestao_crm.leads
    set status = 'negociacao'
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');
  elsif new.resultado in ('visita_agendada', 'test_drive') then
    update gestao_crm.leads
    set status = 'qualificado', motivo_status_id = new.motivo_status_id
    where id = new.lead_id and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado');
  elsif new.resultado = 'contato_realizado' then
    update gestao_crm.leads set status = 'em_contato'
    where id = new.lead_id and status in ('novo', 'tentativa_contato');
  elsif new.resultado = 'sem_resposta' then
    update gestao_crm.leads set status = 'tentativa_contato'
    where id = new.lead_id and status = 'novo';
  end if;

  return new;
end;
$$;

comment on function gestao_crm.prepare_lead_phase1() is
  'Exige motivo_status_id para qualificado/convertido/perdido. '
  'A transicao para convertido so e aceita quando gestao_crm.allow_convertido (GUC de transacao) = on, '
  'setada apenas por gestao_crm.apply_venda_outcome() e pelo branch venda_realizada de '
  'gestao_crm.apply_activity_outcome() -- edicao manual (Kanban/LeadForm) nao pode mais converter o lead '
  'sem passar por Proposta/Venda. Nao ha mais exigencia de previsao_fechamento (coluna removida em '
  '20260924120000_remove_crm_lead_previsao_fechamento.sql). Mantenha em sincronia com '
  'gestao_crm.apply_activity_outcome(), gestao_crm.prepare_activity_business_state(), '
  'gestao_crm.prepare_venda_business_state()/apply_venda_outcome() e apps/crm/src/lib/leadStatus.js '
  '(LEAD_STATUS_REQUIREMENTS). A sincronizacao de clientes_crm.status_relacionamento para "convertido" e '
  'centralizada em gestao_crm.sync_cliente_status_relacionamento() (trigger em leads) -- nao replique esse '
  'UPDATE em nenhuma funcao nova.';

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads (status, motivo_status_id), com '
  'elegibilidade guardada por WHERE status IN (...). Nao propaga mais previsao_fechamento (coluna removida '
  'em 20260924120000_remove_crm_lead_previsao_fechamento.sql). O branch venda_realizada seta '
  'gestao_crm.allow_convertido antes do UPDATE, unico jeito (junto com apply_venda_outcome()) de passar '
  'pelo guard de gestao_crm.prepare_lead_phase1(). NAO atualiza clientes_crm.status_relacionamento '
  'diretamente -- isso e feito pelo trigger central gestao_crm.sync_cliente_status_relacionamento(). '
  'Mantenha em sincronia com gestao_crm.prepare_lead_phase1() e apps/crm/src/lib/leadStatus.js '
  '(RESULTADO_LEAD_STATUS_TARGET, isLeadEligibleForResultado).';

comment on function gestao_crm.prepare_activity_business_state() is
  'Valida e normaliza gestao_crm.atendimentos conforme status/resultado antes do UPDATE. Nao exige mais '
  'previsao_fechamento para concluir uma atividade com resultado proposta_enviada (coluna removida em '
  '20260924120000_remove_crm_lead_previsao_fechamento.sql). Mantenha em sincronia com '
  'gestao_crm.apply_activity_outcome() e apps/crm/src/components/eventos/EventoForm.jsx.';

notify pgrst, 'reload schema';
