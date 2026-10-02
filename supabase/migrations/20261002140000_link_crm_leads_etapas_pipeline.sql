-- Fases 2.0 + 2.1 do PLANO_LEADS_PIPELINE: liga gestao_crm.leads as etapas de pipeline, sem
-- mudar nenhum comportamento visivel. leads.status continua sendo a fonte de verdade que todas
-- as regras de negocio leem (prepare_lead_phase1, apply_activity_outcome, apply_venda_outcome,
-- sync de cliente, historico); etapa_id passa a andar junto, sincronizado por trigger.
--
-- O que entra:
--   etapas_pipeline.tipo      em_andamento | ganho | perdido (2.1)
--   leads.pipeline_id         pipeline do lead (hoje todos no pipeline padrao "Comercial")
--   leads.etapa_id            etapa atual (FK on delete restrict)
--   leads.etapa_tipo          copia de etapas_pipeline.tipo, para indices parciais (2.2)
--   trg_crm_leads_a_sync_etapa  sincroniza status <-> etapa_id. O prefixo "a_" faz ele rodar antes
--                             de trg_crm_leads_prepare_phase1 (triggers BEFORE rodam em ordem
--                             alfabetica), entao as regras atuais ja enxergam o status derivado.
--   Travas novas em etapas_pipeline:
--     - etapa de sistema nao troca de tipo, nao pode ser inativada e mantem a ordem relativa
--       novo < tentativa_contato < em_contato < qualificado < negociacao < convertido/perdido
--       (etapas livres podem ficar em qualquer posicao). A 2.2 vai decidir transicoes por ordem.
--     - etapa com leads nao pode ser inativada, trocar de tipo nem de pipeline; excluir e barrado
--       pela FK.
--
-- Fora daqui (proximas fases): regras de negocio lendo etapa/tipo (2.2), indices sobre
-- etapa_tipo (2.2), crm-api aceitando etapa_id (2.4), telas (2.5), exigir 1 etapa de ganho e 1
-- de perdido por pipeline (validacao da tela de Pipelines, 2.5).
--
-- Rollback seguro nesta fase: nada alem destes triggers le as colunas novas.

-- ---------------------------------------------------------------------------
-- 2.1: tipo da etapa
-- ---------------------------------------------------------------------------
alter table gestao_crm.etapas_pipeline
  add column if not exists tipo text not null default 'em_andamento';

alter table gestao_crm.etapas_pipeline
  drop constraint if exists etapas_pipeline_tipo_check;
alter table gestao_crm.etapas_pipeline
  add constraint etapas_pipeline_tipo_check check (tipo in ('em_andamento', 'ganho', 'perdido'));

update gestao_crm.etapas_pipeline
set tipo = case chave_sistema
  when 'convertido' then 'ganho'
  when 'perdido' then 'perdido'
  else 'em_andamento'
end
where chave_sistema is not null;

-- Etapas de sistema passam a ser obrigatorias para as regras de negocio: reativa qualquer uma
-- que tenha sido inativada (a tela de Pipelines nao oferece isso hoje, mas a API aceitava).
update gestao_crm.etapas_pipeline
set ativo = true
where chave_sistema is not null and not ativo;

comment on column gestao_crm.etapas_pipeline.tipo is
  'em_andamento (lead ativo), ganho ou perdido (terminais). Substitui as listas fixas de status '
  'ativos. Etapa de sistema nao troca de tipo; etapa com leads tambem nao.';

-- Posicao fixa das etapas de sistema (convertido e perdido empatam: entre elas a ordem e livre).
create or replace function gestao_crm.crm_etapa_sistema_posicao(chave text)
returns integer
language sql
immutable
as $$
  select case chave
    when 'novo' then 1
    when 'tentativa_contato' then 2
    when 'em_contato' then 3
    when 'qualificado' then 4
    when 'negociacao' then 5
    when 'convertido' then 6
    when 'perdido' then 6
  end;
$$;

-- Os dados atuais precisam respeitar a ordem antes de a trava entrar.
do $$
declare
  pipeline_nome text;
begin
  select p.nome
  into pipeline_nome
  from gestao_crm.etapas_pipeline a
  join gestao_crm.etapas_pipeline b
    on b.pipeline_id = a.pipeline_id
   and b.chave_sistema is not null
   and gestao_crm.crm_etapa_sistema_posicao(b.chave_sistema) > gestao_crm.crm_etapa_sistema_posicao(a.chave_sistema)
   and b.ordem <= a.ordem
  join gestao_crm.pipelines p on p.id = a.pipeline_id
  where a.chave_sistema is not null
  limit 1;

  if pipeline_nome is not null then
    raise exception using message = format(
      'O pipeline "%s" tem etapas de sistema fora da ordem (Novo, Tentativa de contato, Em contato, '
      'Qualificado, Negociacao, Convertido/Perdido). Reordene pela tela de Pipelines e rode a migration de novo.',
      pipeline_nome
    );
  end if;
end
$$;

create or replace function gestao_crm.protect_crm_pipeline_sistema()
returns trigger
language plpgsql
as $$
declare
  posicao integer;
begin
  if tg_table_name = 'pipelines' and tg_op = 'DELETE' then
    if old.padrao then
      raise exception using errcode = '23514', message = 'O pipeline padrao nao pode ser excluido.';
    end if;
  end if;

  if tg_table_name = 'etapas_pipeline' then
    if old.chave_sistema is not null then
      if tg_op = 'DELETE' then
        raise exception using errcode = '23514', message = 'Etapas de sistema nao podem ser excluidas.';
      end if;
      if tg_op = 'UPDATE' and (
        new.pipeline_id is distinct from old.pipeline_id
        or new.chave_sistema is distinct from old.chave_sistema
      ) then
        raise exception using errcode = '23514', message = 'Etapas de sistema nao podem trocar de pipeline ou perder sua chave.';
      end if;
      if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
        raise exception using errcode = '23514', message = 'Etapas de sistema nao podem trocar de tipo.';
      end if;
      if tg_op = 'UPDATE' and not new.ativo and old.ativo then
        raise exception using errcode = '23514', message = 'Etapas de sistema nao podem ser inativadas.';
      end if;
      if tg_op = 'UPDATE' and new.ordem is distinct from old.ordem then
        posicao := gestao_crm.crm_etapa_sistema_posicao(old.chave_sistema);
        if exists (
          select 1
          from gestao_crm.etapas_pipeline outra
          where outra.pipeline_id = new.pipeline_id
            and outra.id <> new.id
            and outra.chave_sistema is not null
            and (
              (gestao_crm.crm_etapa_sistema_posicao(outra.chave_sistema) < posicao and outra.ordem >= new.ordem)
              or (gestao_crm.crm_etapa_sistema_posicao(outra.chave_sistema) > posicao and outra.ordem <= new.ordem)
            )
        ) then
          raise exception using errcode = '23514', message =
            'Etapas de sistema nao podem trocar de ordem entre si (Novo, Tentativa de contato, Em contato, '
            'Qualificado, Negociacao, Convertido/Perdido). Etapas livres podem ficar em qualquer posicao.';
        end if;
      end if;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2.0: colunas em leads + carga inicial
-- ---------------------------------------------------------------------------

-- Pipeline padrao = o que tem as etapas de sistema (seed "Comercial"), preferindo o marcado padrao.
create or replace function gestao_crm.crm_pipeline_padrao_id()
returns uuid
language sql
stable
security definer
set search_path = gestao_crm, public
as $$
  select p.id
  from gestao_crm.pipelines p
  where exists (
    select 1 from gestao_crm.etapas_pipeline e
    where e.pipeline_id = p.id and e.chave_sistema = 'novo'
  )
  order by p.padrao desc, p.criado_em asc
  limit 1;
$$;

alter table gestao_crm.leads
  add column if not exists pipeline_id uuid,
  add column if not exists etapa_id uuid,
  add column if not exists etapa_tipo text;

alter table gestao_crm.leads drop constraint if exists leads_pipeline_id_fkey;
alter table gestao_crm.leads
  add constraint leads_pipeline_id_fkey
  foreign key (pipeline_id) references gestao_crm.pipelines(id) on delete restrict;

alter table gestao_crm.leads drop constraint if exists leads_etapa_id_fkey;
alter table gestao_crm.leads
  add constraint leads_etapa_id_fkey
  foreign key (etapa_id) references gestao_crm.etapas_pipeline(id) on delete restrict;

alter table gestao_crm.leads drop constraint if exists leads_etapa_tipo_check;
alter table gestao_crm.leads
  add constraint leads_etapa_tipo_check check (etapa_tipo in ('em_andamento', 'ganho', 'perdido'));

create index if not exists idx_crm_leads_etapa_id on gestao_crm.leads (etapa_id);
create index if not exists idx_crm_leads_pipeline_id on gestao_crm.leads (pipeline_id);

-- Carga inicial com os triggers de leads desligados: e so preenchimento de colunas novas, nao
-- deve mexer em atualizado_em, gerar historico nem revalidar regras (prepare_lead_phase1 valida
-- o motivo em todo UPDATE e travaria leads com motivo hoje inativo).
alter table gestao_crm.leads disable trigger user;

update gestao_crm.leads l
set pipeline_id = e.pipeline_id,
    etapa_id = e.id,
    etapa_tipo = e.tipo
from gestao_crm.etapas_pipeline e
where e.pipeline_id = gestao_crm.crm_pipeline_padrao_id()
  and e.chave_sistema = l.status
  and l.etapa_id is null;

alter table gestao_crm.leads enable trigger user;

do $$
declare
  sem_etapa integer;
begin
  select count(*) into sem_etapa from gestao_crm.leads where etapa_id is null;
  if sem_etapa > 0 then
    raise exception using message = format(
      '%s lead(s) ficaram sem etapa: o pipeline padrao nao tem etapa de sistema para o status deles.',
      sem_etapa
    );
  end if;
end
$$;

alter table gestao_crm.leads
  alter column pipeline_id set not null,
  alter column etapa_id set not null,
  alter column etapa_tipo set not null;

comment on column gestao_crm.leads.etapa_id is
  'Etapa atual do lead. Sincronizada com status por trg_crm_leads_a_sync_etapa ate o corte da '
  'fase 2.6 do PLANO_LEADS_PIPELINE. Deve pertencer a pipeline_id.';
comment on column gestao_crm.leads.etapa_tipo is
  'Copia de etapas_pipeline.tipo da etapa atual, mantida por trg_crm_leads_a_sync_etapa. Existe '
  'porque indice parcial nao pode ler outra tabela. Nao gravar direto.';

-- ---------------------------------------------------------------------------
-- 2.0: sincronizacao status <-> etapa_id
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_crm_leads_a_sync_etapa on gestao_crm.leads;
create trigger trg_crm_leads_a_sync_etapa
before insert or update on gestao_crm.leads
for each row execute function gestao_crm.sync_lead_etapa_status();

grant execute on function gestao_crm.sync_lead_etapa_status() to authenticated, service_role;
grant execute on function gestao_crm.crm_pipeline_padrao_id() to authenticated, service_role;

comment on function gestao_crm.sync_lead_etapa_status() is
  'Fases 2.0/2.1 do PLANO_LEADS_PIPELINE. Mantem leads.status e leads.etapa_id em sincronia: '
  'mudou so a etapa -> status vem da chave_sistema (ou do tipo, em etapa livre); mudou so o status '
  '-> etapa de sistema com essa chave no pipeline do lead; mudaram os dois -> precisam concordar. '
  'Tambem garante etapa do mesmo pipeline e grava etapa_tipo. Roda antes de prepare_lead_phase1 '
  '(prefixo a_ no nome do trigger), entao as regras atuais de status continuam valendo para quem '
  'mover o lead por etapa_id.';

-- ---------------------------------------------------------------------------
-- 2.0: etapa com leads
-- ---------------------------------------------------------------------------
create or replace function gestao_crm.validate_etapa_pipeline_leads()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if (not new.ativo and old.ativo)
     or new.tipo is distinct from old.tipo
     or new.pipeline_id is distinct from old.pipeline_id then
    if exists (select 1 from gestao_crm.leads where etapa_id = old.id) then
      raise exception using errcode = '23514', message = case
        when not new.ativo and old.ativo then 'Esta etapa possui leads. Mova-os para outra etapa antes de inativar.'
        when new.tipo is distinct from old.tipo then 'Esta etapa possui leads. Mova-os para outra etapa antes de trocar o tipo.'
        else 'Esta etapa possui leads. Mova-os para outra etapa antes de trocar o pipeline.'
      end;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_etapas_pipeline_validate_leads on gestao_crm.etapas_pipeline;
create trigger trg_crm_etapas_pipeline_validate_leads
before update on gestao_crm.etapas_pipeline
for each row execute function gestao_crm.validate_etapa_pipeline_leads();

grant execute on function gestao_crm.validate_etapa_pipeline_leads() to authenticated, service_role;

notify pgrst, 'reload schema';
