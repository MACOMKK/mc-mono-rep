-- Fecha o gap identificado apos a introducao de gestao_crm.vendas: ate aqui, o Kanban/
-- LeadForm podia mover um lead direto para 'convertido' (via prepare_lead_phase1()) sem
-- nunca ter passado por Proposta/Venda -- ou seja, a "conversao" ficava sem lastro em
-- venda alguma, o problema original que motivou a modelagem de Proposta/Venda.
--
-- Esta migration passa a exigir que toda transicao de leads.status para 'convertido'
-- venha de um caminho confiavel (gestao_crm.apply_venda_outcome() ou o branch
-- 'venda_realizada' de gestao_crm.apply_activity_outcome(), que ja registra o resultado
-- da atividade como motivo de negocio). Qualquer outra tentativa (edicao manual via
-- Kanban/LeadForm, update direto) passa a ser bloqueada com mensagem amigavel.
--
-- Mecanismo: os dois caminhos confiaveis fazem `set_config('gestao_crm.allow_convertido',
-- 'on', true)` (escopo de transacao) imediatamente antes do UPDATE gestao_crm.leads;
-- prepare_lead_phase1() checa essa flag antes de aceitar a transicao para 'convertido'.

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

-- Autoriza a transicao dentro da propria transacao antes do UPDATE gestao_crm.leads.
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
    set status = 'negociacao', previsao_fechamento = new.previsao_fechamento
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

create or replace function gestao_crm.apply_venda_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  update gestao_crm.veiculos_estoque
  set status = 'vendido'
  where id = new.veiculo_estoque_id;

  perform set_config('gestao_crm.allow_convertido', 'on', true);

  update gestao_crm.leads
  set status = 'convertido', motivo_status_id = new.motivo_status_id
  where id = new.lead_id;

  insert into gestao_crm.historico_atendimentos (
    cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados, criado_por
  ) values (
    new.cliente_id,
    new.lead_id,
    'venda_fechada',
    format('Venda fechada no valor de %s.', new.valor_final),
    'Venda',
    new.id,
    'convertido',
    jsonb_build_object(
      'venda_id', new.id,
      'proposta_id', new.proposta_id,
      'veiculo_estoque_id', new.veiculo_estoque_id,
      'valor_final', new.valor_final,
      'vendedor_id', new.vendedor_id
    ),
    new.criado_por
  );

  return new;
end;
$$;

comment on function gestao_crm.prepare_lead_phase1() is
  'Exige motivo_status_id para qualificado/convertido/perdido e previsao_fechamento para negociacao. '
  'A transicao para convertido so e aceita quando gestao_crm.allow_convertido (GUC de transacao) = on, '
  'setada apenas por gestao_crm.apply_venda_outcome() e pelo branch venda_realizada de '
  'gestao_crm.apply_activity_outcome() -- edicao manual (Kanban/LeadForm) nao pode mais converter o lead '
  'sem passar por Proposta/Venda. Mantenha em sincronia com gestao_crm.apply_activity_outcome(), '
  'gestao_crm.prepare_activity_business_state(), gestao_crm.prepare_venda_business_state()/'
  'apply_venda_outcome() e apps/crm/src/lib/leadStatus.js (LEAD_STATUS_REQUIREMENTS). A sincronizacao de '
  'clientes_crm.status_relacionamento para "convertido" e centralizada em '
  'gestao_crm.sync_cliente_status_relacionamento() (trigger em leads) -- nao replique esse UPDATE em '
  'nenhuma funcao nova.';

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads (status, motivo_status_id, '
  'previsao_fechamento), com elegibilidade guardada por WHERE status IN (...). O branch venda_realizada '
  'seta gestao_crm.allow_convertido antes do UPDATE, unico jeito (junto com apply_venda_outcome()) de '
  'passar pelo guard de gestao_crm.prepare_lead_phase1(). NAO atualiza clientes_crm.status_relacionamento '
  'diretamente -- isso e feito pelo trigger central gestao_crm.sync_cliente_status_relacionamento(). '
  'Mantenha em sincronia com gestao_crm.prepare_lead_phase1() e apps/crm/src/lib/leadStatus.js '
  '(RESULTADO_LEAD_STATUS_TARGET, isLeadEligibleForResultado).';

comment on function gestao_crm.apply_venda_outcome() is
  'Fecha o ciclo de venda: baixa o veiculo do estoque, seta gestao_crm.allow_convertido e converte o lead '
  '(o guard de gestao_crm.prepare_lead_phase1() so libera a transicao para convertido por essa flag), e '
  'registra o evento no historico. A conversao do lead aqui dispara tambem o trigger central de sincronia '
  'de gestao_crm.clientes_crm criado em 20260918120000_centralize_crm_cliente_status_sync.sql -- nenhuma '
  'regra duplicada.';

notify pgrst, 'reload schema';
