-- Fase 2.7 (passo 2c/5) do PLANO_LEADS_PIPELINE.local.md: a exigencia de motivo em
-- visita_agendada/test_drive passa a olhar a etapa-alvo configurada em
-- gestao_crm.pipeline_automacoes (e seu `exige_motivo`) em vez de assumir sempre a etapa
-- chave_sistema='qualificado'. Mesma elegibilidade de antes (etapa atual tipo em_andamento e
-- ordem <= ordem do alvo) -- so a origem do alvo muda, espelhando apply_activity_outcome()
-- (20261008150000). venda_realizada/lead_perdido continuam exigindo motivo sempre, sem mudanca.

create or replace function gestao_crm.prepare_activity_business_state()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  linked_client_id uuid;
  lead_pipeline_id uuid;
  etapa_atual_ordem numeric;
  etapa_atual_tipo text;
  alvo_ordem numeric;
  alvo_exige_motivo boolean;
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

    if new.resultado in ('visita_agendada', 'test_drive') then
      select l.pipeline_id, e.ordem, e.tipo
      into lead_pipeline_id, etapa_atual_ordem, etapa_atual_tipo
      from gestao_crm.leads l
      join gestao_crm.etapas_pipeline e on e.id = l.etapa_id
      where l.id = new.lead_id;

      select ed.ordem, ed.exige_motivo
      into alvo_ordem, alvo_exige_motivo
      from gestao_crm.pipeline_automacoes pa
      join gestao_crm.etapas_pipeline ed on ed.id = pa.etapa_destino_id
      where pa.pipeline_id = lead_pipeline_id and pa.resultado = new.resultado;
    end if;

    if new.resultado in ('venda_realizada', 'lead_perdido')
       or (
         new.resultado in ('visita_agendada', 'test_drive')
         and etapa_atual_tipo = 'em_andamento'
         and coalesce(alvo_exige_motivo, false)
         and etapa_atual_ordem <= alvo_ordem
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

comment on function gestao_crm.prepare_activity_business_state() is
  'Valida e normaliza gestao_crm.atendimentos conforme status/resultado antes do INSERT/UPDATE. Motivo '
  'obrigatorio em venda_realizada/lead_perdido sempre; em visita_agendada/test_drive so quando o lead '
  'esta em etapa tipo em_andamento com ordem <= ordem do alvo configurado em '
  'gestao_crm.pipeline_automacoes para aquele pipeline/resultado E esse alvo tem exige_motivo=true '
  '(os casos em que apply_activity_outcome() move o lead para uma etapa que exige motivo). Mantenha '
  'em sincronia com gestao_crm.apply_activity_outcome() e '
  'apps/crm/src/components/eventos/EventoForm.jsx.';

notify pgrst, 'reload schema';
