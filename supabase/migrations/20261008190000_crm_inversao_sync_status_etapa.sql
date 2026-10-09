-- Inversao da sync (PLANO_LEADS_PIPELINE.local.md): `leads.status` deixa de ser bidirecional e
-- passa a ser SÓ espelho de leitura, sempre derivado de `etapa_id` -- nunca o contrário. Remove
-- o ramo "status decide a etapa" (só funcionava procurando `chave_sistema = status` no pipeline
-- do lead, o que falha em qualquer pipeline sem etapas de sistema, ex. CONSÓRCIO/MOTOS).
--
-- Levantamento prévio (nesta sessão) confirmou: o único código que ainda escrevia `status` sem
-- `etapa_id` era `LeadRepository.update` em `apps/crm/src/api/crmDataClient.js` (ramo morto, sem
-- nenhuma tela acionando-o hoje) -- já removido junto com este commit. Nenhuma outra trigger,
-- Edge Function ou cron escreve `leads.status` diretamente.
--
-- Qualquer valor de `status` que o cliente mandar no INSERT/UPDATE agora é ignorado e
-- sobrescrito por esta trigger -- não há mais verificação de "status e etapa precisam
-- concordar" (deixou de fazer sentido: status não é mais uma entrada válida).

create or replace function gestao_crm.sync_lead_etapa_status()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  status_ativos constant text[] := array['novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao'];
  etapa gestao_crm.etapas_pipeline%rowtype;
begin
  if new.pipeline_id is null then
    if new.etapa_id is not null then
      select pipeline_id into new.pipeline_id from gestao_crm.etapas_pipeline where id = new.etapa_id;
    else
      new.pipeline_id := gestao_crm.crm_pipeline_padrao_id();
    end if;
  end if;

  if new.etapa_id is null then
    -- Sem etapa (so acontece em INSERT, leads.etapa_id e not null): etapa inicial configurada
    -- do pipeline (fallback: 1a etapa em_andamento por ordem).
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
  end if;

  select * into etapa from gestao_crm.etapas_pipeline where id = new.etapa_id;
  if not found then
    raise exception using errcode = '23503', message = 'Etapa do pipeline nao encontrada.';
  end if;

  if tg_op = 'UPDATE' and new.etapa_id is distinct from old.etapa_id and not etapa.ativo then
    raise exception using errcode = '23514', message = 'Esta etapa do pipeline esta inativa.';
  end if;

  if etapa.pipeline_id is distinct from new.pipeline_id then
    raise exception using errcode = '23514', message = 'A etapa nao pertence ao pipeline do lead.';
  end if;

  -- status e so espelho: sempre derivado da etapa, nunca lido de new.status. Etapa livre
  -- em_andamento mantem o status atual se ele ja for ativo (preserva o rotulo ao mover entre
  -- etapas livres); senao usa em_contato como rotulo generico.
  new.status := coalesce(
    etapa.chave_sistema,
    case etapa.tipo when 'ganho' then 'convertido' when 'perdido' then 'perdido' end
  );
  if new.status is null then
    new.status := 'em_contato';
    if tg_op = 'UPDATE' and old.status = any(status_ativos) then
      new.status := old.status;
    end if;
  end if;

  new.etapa_tipo := etapa.tipo;
  return new;
end;
$$;

comment on function gestao_crm.sync_lead_etapa_status() is
  'Inversao da sync (fase 2.7): leads.status e SO espelho de leitura, sempre derivado de '
  'etapa_id -- qualquer status enviado pelo cliente e ignorado/sobrescrito. INSERT sem etapa_id '
  'cai na pipelines.etapa_inicial_id (fallback: 1a etapa em_andamento por ordem). Etapa de '
  'sistema deriva o status pela chave_sistema; etapa tipo ganho/perdido deriva pelo tipo; etapa '
  'livre em_andamento mantem o status atual se ja ativo, senao usa em_contato. Roda antes de '
  'prepare_lead_phase1 (prefixo a_ no nome do trigger).';

notify pgrst, 'reload schema';
