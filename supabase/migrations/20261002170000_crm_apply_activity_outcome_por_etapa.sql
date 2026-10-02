-- Fase 2.2 (3/7) do PLANO_LEADS_PIPELINE: o resultado da atividade move o lead pela etapa
-- (etapa_id), com elegibilidade pela ordem das etapas em vez de listas fixas de status.
--
-- Alvo de cada resultado = etapa de sistema (chave_sistema) do pipeline do lead:
--   venda_realizada   -> convertido         (de qualquer etapa, liga gestao_crm.allow_convertido)
--   lead_perdido      -> perdido            (de qualquer etapa)
--   proposta_enviada  -> negociacao         \
--   visita/test_drive -> qualificado         | so se a etapa atual for tipo em_andamento
--   contato_realizado -> em_contato          | e estiver antes do alvo (ordem <= ordem do alvo)
--   sem_resposta      -> tentativa_contato  /
--
-- Com as etapas de sistema o resultado e identico as listas antigas: a ordem relativa entre
-- elas e travada por protect_crm_pipeline_sistema() (20261002140000). Etapas livres
-- em_andamento passam a avancar tambem, conforme a posicao em que estao no funil.
-- "<=" (e nao "<") preserva o caso antigo de visita/test_drive em lead ja qualificado, que
-- atualizava o motivo_status_id; nos demais, mover para a mesma etapa nao altera nada.
--
-- Pipeline sem a etapa de sistema do alvo: venda/perdido caem na primeira etapa ativa do
-- tipo ganho/perdido do pipeline (erro se nao houver); os resultados de avanco nao fazem nada.
--
-- O UPDATE grava etapa_id; trg_crm_leads_a_sync_etapa deriva o status a partir da etapa.

create or replace function gestao_crm.apply_activity_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  lead_pipeline_id uuid;
  etapa_atual_ordem numeric;
  etapa_atual_tipo text;
  alvo_chave text;
  alvo_tipo text;
  alvo record;
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

  alvo_chave := case new.resultado
    when 'venda_realizada' then 'convertido'
    when 'lead_perdido' then 'perdido'
    when 'proposta_enviada' then 'negociacao'
    when 'visita_agendada' then 'qualificado'
    when 'test_drive' then 'qualificado'
    when 'contato_realizado' then 'em_contato'
    when 'sem_resposta' then 'tentativa_contato'
  end;

  if alvo_chave is null then
    return new;
  end if;

  alvo_tipo := case alvo_chave
    when 'convertido' then 'ganho'
    when 'perdido' then 'perdido'
    else 'em_andamento'
  end;

  select l.pipeline_id, e.ordem, e.tipo
  into lead_pipeline_id, etapa_atual_ordem, etapa_atual_tipo
  from gestao_crm.leads l
  join gestao_crm.etapas_pipeline e on e.id = l.etapa_id
  where l.id = new.lead_id;

  if lead_pipeline_id is null then
    return new;
  end if;

  select e.id, e.ordem
  into alvo
  from gestao_crm.etapas_pipeline e
  where e.pipeline_id = lead_pipeline_id
    and e.chave_sistema = alvo_chave;

  if not found and alvo_tipo in ('ganho', 'perdido') then
    select e.id, e.ordem
    into alvo
    from gestao_crm.etapas_pipeline e
    where e.pipeline_id = lead_pipeline_id
      and e.tipo = alvo_tipo
      and e.ativo
    order by e.ordem
    limit 1;

    if not found then
      raise exception using
        errcode = '23514',
        message = format('O pipeline do lead nao possui etapa do tipo %s.', alvo_tipo);
    end if;
  elsif not found then
    return new;
  end if;

  if new.resultado = 'venda_realizada' then
    perform set_config('gestao_crm.allow_convertido', 'on', true);

    update gestao_crm.leads
    set etapa_id = alvo.id, motivo_status_id = new.motivo_status_id, convertido_em = coalesce(convertido_em, now())
    where id = new.lead_id;
  elsif new.resultado = 'lead_perdido' then
    update gestao_crm.leads
    set etapa_id = alvo.id, motivo_status_id = new.motivo_status_id, motivo_perda = new.motivo_resultado, perdido_em = coalesce(perdido_em, now())
    where id = new.lead_id;
  elsif etapa_atual_tipo = 'em_andamento' and etapa_atual_ordem <= alvo.ordem then
    if new.resultado in ('visita_agendada', 'test_drive') then
      update gestao_crm.leads
      set etapa_id = alvo.id, motivo_status_id = new.motivo_status_id
      where id = new.lead_id;
    else
      update gestao_crm.leads
      set etapa_id = alvo.id
      where id = new.lead_id;
    end if;
  end if;

  return new;
end;
$$;

grant execute on function gestao_crm.apply_activity_outcome() to authenticated, service_role;

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads movendo etapa_id para a etapa de sistema do '
  'resultado no pipeline do lead. venda_realizada/lead_perdido valem de qualquer etapa; os demais so com a '
  'etapa atual tipo em_andamento e ordem <= ordem do alvo. O branch venda_realizada seta '
  'gestao_crm.allow_convertido antes do UPDATE (unico jeito, junto com apply_venda_outcome(), de passar pela '
  'trava de ganho de prepare_lead_phase1()). NAO atualiza clientes_crm.status_relacionamento -- isso e do '
  'trigger sync_cliente_status_relacionamento(). Mantenha em sincronia com prepare_activity_business_state() '
  'e apps/crm/src/lib/leadStatus.js (RESULTADO_LEAD_STATUS_TARGET, isLeadEligibleForResultado).';

notify pgrst, 'reload schema';
