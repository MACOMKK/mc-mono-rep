-- gestao_crm.apply_activity_outcome() ficou desatualizada em relacao a duas migrations
-- posteriores que mudaram as regras de gestao_crm.leads.status:
--
-- 1) 20260912120000_rename_crm_lead_status_proposta_to_negociacao.sql renomeou o status
--    'proposta' para 'negociacao' -- apply_activity_outcome() ainda tentava setar 'proposta'
--    (valor que nao existe mais em leads_status_check), quebrando a conclusao de qualquer
--    atividade com resultado 'proposta_enviada' com erro cru de constraint.
--
-- 2) 20260912140000_add_crm_motivos_status.sql passou a exigir, via trigger
--    prepare_lead_phase1(), motivo_status_id (para qualificado/convertido/perdido) e
--    previsao_fechamento (para negociacao) em qualquer UPDATE de leads.status --
--    apply_activity_outcome() nunca setava esses campos, entao a conclusao de atividade
--    com resultado venda_realizada, lead_perdido, proposta_enviada, visita_agendada ou
--    test_drive sempre falhava (a menos que o lead ja tivesse os campos preenchidos por
--    outro caminho).
--
-- Fix: atendimentos passa a carregar motivo_status_id/previsao_fechamento (preenchidos
-- pelo formulario de conclusao da atividade quando a transicao de lead exigir), validados
-- em prepare_activity_business_state() e propagados por apply_activity_outcome() para o
-- UPDATE de leads correspondente.

alter table gestao_crm.atendimentos
  add column if not exists motivo_status_id uuid references gestao_crm.motivos_status(id);

alter table gestao_crm.atendimentos
  add column if not exists previsao_fechamento date;

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
    new.previsao_fechamento = null;
    new.concluido_em = null;
  elsif new.status = 'cancelada' then
    new.resultado = null;
    new.motivo_resultado = null;
    new.motivo_status_id = null;
    new.previsao_fechamento = null;
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

    if new.resultado = 'proposta_enviada'
       and lead_atual_status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao')
       and new.previsao_fechamento is null then
      raise exception using
        errcode = '23514',
        message = 'Informe a previsao de fechamento para concluir esta atividade.';
    end if;

    if new.resultado <> 'proposta_enviada' then
      new.previsao_fechamento = null;
    end if;

    new.concluido_em = coalesce(new.concluido_em, now());
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
    update gestao_crm.leads
    set status = 'convertido', motivo_status_id = new.motivo_status_id, convertido_em = coalesce(convertido_em, now())
    where id = new.lead_id;

    update gestao_crm.clientes_crm
    set status_relacionamento = 'cliente'
    where id = new.cliente_id;
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

notify pgrst, 'reload schema';
