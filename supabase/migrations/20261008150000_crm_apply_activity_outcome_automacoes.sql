-- Fase 2.7 (passo 2b/5) do PLANO_LEADS_PIPELINE.local.md: o alvo dos resultados "de avanco"
-- (contato_realizado, sem_resposta, visita_agendada, test_drive, proposta_enviada) passa a vir de
-- gestao_crm.pipeline_automacoes (pipeline_id, resultado) em vez do switch hardcoded por
-- chave_sistema. Sem automacao cadastrada para o pipeline/resultado, continua sem fazer nada
-- (mesmo comportamento de hoje quando a etapa de sistema nao existe no pipeline).
--
-- venda_realizada/lead_perdido NAO mudam: continuam resolvendo por chave_sistema
-- ('convertido'/'perdido') com fallback para a 1a etapa ativa do tipo ganho/perdido, de qualquer
-- etapa atual -- isso nao e configuravel por pipeline_automacoes.

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

  select l.pipeline_id, e.ordem, e.tipo
  into lead_pipeline_id, etapa_atual_ordem, etapa_atual_tipo
  from gestao_crm.leads l
  join gestao_crm.etapas_pipeline e on e.id = l.etapa_id
  where l.id = new.lead_id;

  if lead_pipeline_id is null then
    return new;
  end if;

  if new.resultado in ('venda_realizada', 'lead_perdido') then
    alvo_chave := case new.resultado when 'venda_realizada' then 'convertido' else 'perdido' end;
    alvo_tipo := case new.resultado when 'venda_realizada' then 'ganho' else 'perdido' end;

    select e.id, e.ordem
    into alvo
    from gestao_crm.etapas_pipeline e
    where e.pipeline_id = lead_pipeline_id
      and e.chave_sistema = alvo_chave;

    if not found then
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
    end if;

    if new.resultado = 'venda_realizada' then
      perform set_config('gestao_crm.allow_convertido', 'on', true);
      update gestao_crm.leads
      set etapa_id = alvo.id, motivo_status_id = new.motivo_status_id, convertido_em = coalesce(convertido_em, now())
      where id = new.lead_id;
    else
      update gestao_crm.leads
      set etapa_id = alvo.id, motivo_status_id = new.motivo_status_id, motivo_perda = new.motivo_resultado, perdido_em = coalesce(perdido_em, now())
      where id = new.lead_id;
    end if;

    return new;
  end if;

  -- Demais resultados: alvo configuravel por pipeline_automacoes (fase 2.7).
  select e.id, e.ordem
  into alvo
  from gestao_crm.pipeline_automacoes pa
  join gestao_crm.etapas_pipeline e on e.id = pa.etapa_destino_id
  where pa.pipeline_id = lead_pipeline_id and pa.resultado = new.resultado;

  if not found then
    return new;
  end if;

  if etapa_atual_tipo = 'em_andamento' and etapa_atual_ordem <= alvo.ordem then
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

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads movendo etapa_id. venda_realizada/'
  'lead_perdido valem de qualquer etapa, por chave_sistema/tipo ganho-perdido (nao configuravel). '
  'Os demais resultados buscam o alvo em gestao_crm.pipeline_automacoes (pipeline_id, resultado); '
  'sem automacao cadastrada, nao faz nada. Quando ha automacao, so move com a etapa atual tipo '
  'em_andamento e ordem <= ordem do alvo. O branch venda_realizada seta gestao_crm.allow_convertido '
  'antes do UPDATE (unico jeito, junto com apply_venda_outcome(), de passar pela trava de ganho de '
  'prepare_lead_phase1()). NAO atualiza clientes_crm.status_relacionamento -- isso e do trigger '
  'sync_cliente_status_relacionamento(). Mantenha em sincronia com prepare_activity_business_state() '
  'e apps/crm/src/lib/leadStatus.js (resolveEtapaAlvoResultado).';

notify pgrst, 'reload schema';
