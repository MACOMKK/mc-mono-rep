-- Fase 2.7 (passo 2a/5) do PLANO_LEADS_PIPELINE.local.md: lead novo sem etapa_id passa a cair na
-- `pipelines.etapa_inicial_id` configurada (fallback: 1a etapa tipo em_andamento por ordem), em
-- vez de depender da etapa chave_sistema='novo' -- que só o pipeline Comercial tem. Sem isso,
-- criar um lead em CONSÓRCIO/MOTOS falha ("O pipeline do lead nao possui etapa para o status
-- novo"), porque o INSERT chega com status default 'novo' e nenhuma etapa_id.
--
-- Mudança isolada: só o ramo de INSERT sem etapa_id. Toda a reconciliação status<->etapa em
-- UPDATE (e o INSERT com etapa_id explícito) continua exatamente igual.

create or replace function gestao_crm.sync_lead_etapa_status()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  status_ativos constant text[] := array['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao'];
  etapa gestao_crm.etapas_pipeline%rowtype;
  etapa_mudou boolean;
  status_mudou boolean;
  status_confere boolean;
begin
  if tg_op = 'INSERT' then
    -- Sem etapa_id, o status (default 'novo') decide a etapa; com etapa_id, a etapa decide o status.
    etapa_mudou := new.etapa_id is not null;
    status_mudou := false;
  else
    etapa_mudou := new.etapa_id is distinct from old.etapa_id;
    status_mudou := new.status is distinct from old.status;
  end if;

  if new.pipeline_id is null then
    if new.etapa_id is not null then
      select pipeline_id into new.pipeline_id from gestao_crm.etapas_pipeline where id = new.etapa_id;
    else
      new.pipeline_id := gestao_crm.crm_pipeline_padrao_id();
    end if;
  end if;

  if tg_op = 'INSERT' and new.etapa_id is null then
    select coalesce(
      p.etapa_inicial_id,
      (
        select e2.id from gestao_crm.etapas_pipeline e2
        where e2.pipeline_id = p.id and e2.tipo = 'em_andamento' and e2.ativo
        order by e2.ordem
        limit 1
      )
    )
    into new.etapa_id
    from gestao_crm.pipelines p
    where p.id = new.pipeline_id;

    if new.etapa_id is null then
      raise exception using errcode = '23514', message = 'O pipeline do lead nao possui etapa inicial configurada.';
    end if;

    select * into etapa from gestao_crm.etapas_pipeline where id = new.etapa_id;
    new.status := coalesce(
      etapa.chave_sistema,
      case etapa.tipo when 'ganho' then 'convertido' when 'perdido' then 'perdido' else 'novo' end
    );
    new.etapa_tipo := etapa.tipo;
    return new;
  end if;

  if etapa_mudou then
    select * into etapa from gestao_crm.etapas_pipeline where id = new.etapa_id;
    if not found then
      raise exception using errcode = '23503', message = 'Etapa do pipeline nao encontrada.';
    end if;
    if not etapa.ativo then
      raise exception using errcode = '23514', message = 'Esta etapa do pipeline esta inativa.';
    end if;

    if status_mudou then
      -- Os dois mudaram juntos: precisam concordar.
      status_confere := case
        when etapa.chave_sistema is not null then new.status = etapa.chave_sistema
        when etapa.tipo = 'ganho' then new.status = 'convertido'
        when etapa.tipo = 'perdido' then new.status = 'perdido'
        else new.status = any(status_ativos)
      end;
      if not status_confere then
        raise exception using errcode = '23514', message = 'O status e a etapa informados para o lead nao conferem.';
      end if;
    else
      -- Status derivado da etapa. Etapa livre (sem chave) usa o tipo; em_andamento mantem o
      -- status atual se ele ja for ativo, senao usa em_contato.
      new.status := coalesce(
        etapa.chave_sistema,
        case etapa.tipo when 'ganho' then 'convertido' when 'perdido' then 'perdido' end
      );
      if new.status is null then
        new.status := 'em_contato';
        if tg_op = 'UPDATE' then
          if old.status = any(status_ativos) then
            new.status := old.status;
          end if;
        end if;
      end if;
    end if;
  elsif status_mudou or new.etapa_id is null then
    -- Etapa derivada do status: a etapa de sistema com essa chave no pipeline do lead.
    select * into etapa
    from gestao_crm.etapas_pipeline
    where pipeline_id = new.pipeline_id and chave_sistema = new.status;
    if not found then
      raise exception using errcode = '23514', message = format(
        'O pipeline do lead nao possui etapa para o status %s.', new.status
      );
    end if;
    new.etapa_id := etapa.id;
  else
    select * into etapa from gestao_crm.etapas_pipeline where id = new.etapa_id;
  end if;

  if etapa.pipeline_id is distinct from new.pipeline_id then
    raise exception using errcode = '23514', message = 'A etapa nao pertence ao pipeline do lead.';
  end if;

  new.etapa_tipo := etapa.tipo;
  return new;
end;
$$;

comment on function gestao_crm.sync_lead_etapa_status() is
  'Fases 2.0/2.1/2.7 do PLANO_LEADS_PIPELINE. Mantem leads.status e leads.etapa_id em sincronia: '
  'INSERT sem etapa_id cai na pipelines.etapa_inicial_id (fallback: 1a etapa em_andamento por ordem); '
  'mudou so a etapa -> status vem da chave_sistema (ou do tipo, em etapa livre); mudou so o status '
  '-> etapa de sistema com essa chave no pipeline do lead; mudaram os dois -> precisam concordar. '
  'Tambem garante etapa do mesmo pipeline e grava etapa_tipo. Roda antes de prepare_lead_phase1 '
  '(prefixo a_ no nome do trigger), entao as regras atuais de status continuam valendo para quem '
  'mover o lead por etapa_id.';

notify pgrst, 'reload schema';
