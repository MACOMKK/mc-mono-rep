-- Fase 2.2 (1/7) do PLANO_LEADS_PIPELINE: motivos_status passa a se referir ao tipo/etapa
-- do pipeline, nao mais ao status fixo do lead.
--
-- aplica_em: 'qualificado' (etapa de sistema qualificado), 'ganho' (etapas tipo ganho) e
-- 'perdido' (etapas tipo perdido). Equivale 1:1 ao status antigo:
--   qualificado <-> qualificado | convertido <-> ganho | perdido <-> perdido
--
-- Transicao: motivos_status.status continua existindo (a tela e a crm-api ainda gravam
-- nele) e e mantido em sincronia com aplica_em pelo trigger abaixo, nos dois sentidos.
-- Como o mapeamento e 1:1, a unique (status, nome) ja garante unicidade por aplica_em.
-- Na Fase 2.6 a coluna status e dropada e a unique passa para (aplica_em, nome).

create or replace function gestao_crm.crm_motivo_aplica_em_from_status(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'qualificado' then 'qualificado'
    when 'convertido' then 'ganho'
    when 'perdido' then 'perdido'
  end;
$$;

create or replace function gestao_crm.crm_motivo_status_from_aplica_em(p_aplica_em text)
returns text
language sql
immutable
as $$
  select case p_aplica_em
    when 'qualificado' then 'qualificado'
    when 'ganho' then 'convertido'
    when 'perdido' then 'perdido'
  end;
$$;

alter table gestao_crm.motivos_status
  add column if not exists aplica_em text;

update gestao_crm.motivos_status
set aplica_em = gestao_crm.crm_motivo_aplica_em_from_status(status)
where aplica_em is distinct from gestao_crm.crm_motivo_aplica_em_from_status(status);

alter table gestao_crm.motivos_status
  alter column aplica_em set not null;

alter table gestao_crm.motivos_status
  drop constraint if exists motivos_status_aplica_em_check;
alter table gestao_crm.motivos_status
  add constraint motivos_status_aplica_em_check check (aplica_em in ('qualificado', 'ganho', 'perdido'));

create index if not exists idx_crm_motivos_status_aplica_em on gestao_crm.motivos_status (aplica_em);

create or replace function gestao_crm.sync_motivo_status_aplica_em()
returns trigger
language plpgsql
set search_path = gestao_crm, public
as $$
declare
  status_mudou boolean;
  aplica_em_mudou boolean;
begin
  if tg_op = 'INSERT' then
    status_mudou := new.status is not null;
    aplica_em_mudou := new.aplica_em is not null;
  else
    status_mudou := new.status is distinct from old.status;
    aplica_em_mudou := new.aplica_em is distinct from old.aplica_em;
  end if;

  if aplica_em_mudou and gestao_crm.crm_motivo_status_from_aplica_em(new.aplica_em) is null then
    raise exception using
      errcode = '23514',
      message = 'Tipo do motivo invalido. Use qualificado, ganho ou perdido.';
  end if;

  if status_mudou and aplica_em_mudou then
    if new.aplica_em is distinct from gestao_crm.crm_motivo_aplica_em_from_status(new.status) then
      raise exception using
        errcode = '23514',
        message = 'O status e o tipo informados para o motivo nao conferem.';
    end if;
  elsif aplica_em_mudou then
    new.status := gestao_crm.crm_motivo_status_from_aplica_em(new.aplica_em);
  elsif status_mudou then
    new.aplica_em := gestao_crm.crm_motivo_aplica_em_from_status(new.status);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_motivos_status_a_sync_aplica_em on gestao_crm.motivos_status;
create trigger trg_crm_motivos_status_a_sync_aplica_em
before insert or update on gestao_crm.motivos_status
for each row execute function gestao_crm.sync_motivo_status_aplica_em();

comment on column gestao_crm.motivos_status.aplica_em is
  'Onde o motivo e exigido: qualificado (etapa de sistema qualificado), ganho ou perdido (tipo da etapa). '
  'Substitui motivos_status.status, que fica sincronizado por trigger ate a Fase 2.6 do PLANO_LEADS_PIPELINE.';

notify pgrst, 'reload schema';
