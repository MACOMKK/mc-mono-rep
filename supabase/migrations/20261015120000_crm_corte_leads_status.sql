-- Fase 2.6 do PLANO_LEADS_PIPELINE.local.md: corte final do legado `leads.status`. A inversao da
-- sync (20261008190000) ja tinha deixado `status` como espelho 100% derivado de `etapa_id`; esta
-- migration remove a coluna por completo (e a equivalente em `motivos_status`), apos ajustar todo
-- objeto que ainda dependia dela para nao quebrar.
--
-- Ordem importa: a trigger de `clientes_crm` esta registrada como `after update of status,
-- etapa_id, etapa_tipo` -- `alter table ... drop column status` falha enquanto ela existir assim.
-- Por isso a trigger e recriada ANTES do drop.

-- 1) Trigger de clientes_crm: tira `status` da lista `of` (corpo da funcao ja decide por
--    etapa_tipo='ganho' desde 20261002190000, sem mudanca de logica).
drop trigger if exists trg_crm_leads_sync_cliente_status on gestao_crm.leads;
create trigger trg_crm_leads_sync_cliente_status
after update of etapa_id, etapa_tipo on gestao_crm.leads
for each row
execute function gestao_crm.sync_cliente_status_relacionamento();

comment on function gestao_crm.sync_cliente_status_relacionamento() is
  'Fonte unica de verdade para lead entrando em etapa tipo ganho -> clientes_crm.status_relacionamento=cliente. '
  'Disparado por UPDATE OF etapa_id, etapa_tipo em gestao_crm.leads (atividade, venda ou edicao manual). '
  'Nao duplique este UPDATE em nenhuma funcao nova. (Fase 2.6: `status` saiu da lista `of` junto com a coluna.)';

-- 2) register_lead_change_history: para de ler/gravar `status` (coluna de historico_atendimentos
--    e so informativa e nullable -- nunca foi exibida em nenhuma tela, confirmado antes desta
--    migration; mais simples deixar de preencher do que inventar um rotulo substituto).
create or replace function gestao_crm.register_lead_change_history()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  snapshot jsonb := jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new));
  etapa_changed boolean := new.etapa_id is distinct from old.etapa_id;
  etapa_anterior_nome text;
  etapa_nova_nome text;
  etapa_tipo_label constant jsonb := '{"em_andamento": "Em andamento", "ganho": "Ganho", "perdido": "Perdido"}'::jsonb;
begin
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into gestao_crm.historico_atendimentos (
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, metadados
    ) values (
      new.cliente_id,
      new.id,
      'atribuicao_lead',
      case
        when new.responsavel_id is null then 'Responsavel removido do lead.'
        else 'Responsavel do lead alterado.'
      end,
      'Lead',
      new.id,
      snapshot
    );
  end if;

  if etapa_changed then
    select nome into etapa_anterior_nome from gestao_crm.etapas_pipeline where id = old.etapa_id;
    select nome into etapa_nova_nome from gestao_crm.etapas_pipeline where id = new.etapa_id;

    insert into gestao_crm.historico_atendimentos (
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, metadados
    ) values (
      new.cliente_id,
      new.id,
      'atualizacao_lead',
      format(
        'Etapa alterada de %s para %s.',
        coalesce(etapa_anterior_nome, etapa_tipo_label ->> old.etapa_tipo, old.etapa_tipo),
        coalesce(etapa_nova_nome, etapa_tipo_label ->> new.etapa_tipo, new.etapa_tipo)
      ),
      'Lead',
      new.id,
      snapshot || jsonb_build_object(
        'motivo_status_id', new.motivo_status_id,
        'pipeline_id', new.pipeline_id,
        'etapa_anterior_id', old.etapa_id,
        'etapa_anterior_nome', etapa_anterior_nome,
        'etapa_nova_id', new.etapa_id,
        'etapa_nova_nome', etapa_nova_nome
      )
    );
  elsif new.nome is distinct from old.nome
     or new.telefone is distinct from old.telefone
     or new.email is distinct from old.email
     or new.modelo_interesse is distinct from old.modelo_interesse
     or new.motivo_perda is distinct from old.motivo_perda
     or new.observacoes is distinct from old.observacoes then
    insert into gestao_crm.historico_atendimentos (
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, metadados
    ) values (
      new.cliente_id,
      new.id,
      'atualizacao_lead',
      'Dados comerciais do lead atualizados.',
      'Lead',
      new.id,
      snapshot
    );
  end if;

  return new;
end;
$$;

comment on function gestao_crm.register_lead_change_history() is
  'Fonte unica do historico de alteracoes do lead (troca de responsavel, troca de etapa e dados '
  'comerciais). Cobre todos os caminhos que atualizam gestao_crm.leads: tela (crm-api), '
  'apply_activity_outcome(), apply_venda_outcome() e cancel_venda. Deteccao de troca de etapa e '
  'so por etapa_id. Fase 2.6: parou de ler/gravar leads.status/historico_atendimentos.status '
  '(coluna de historico continua existindo, nullable, so deixou de ser preenchida -- nunca foi '
  'exibida em nenhuma tela). Nao grave historico de troca de etapa ou status na crm-api nem em '
  'outra funcao.';

-- 3) sync_lead_etapa_status: so resolve pipeline_id/etapa_id/etapa_tipo. Toda a derivacao de
--    `status` (que so existia pra manter a coluna legada sincronizada) sai.
create or replace function gestao_crm.sync_lead_etapa_status()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
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

  new.etapa_tipo := etapa.tipo;
  return new;
end;
$$;

comment on function gestao_crm.sync_lead_etapa_status() is
  'Fase 2.6 (corte final): so resolve pipeline_id/etapa_id (fallback pipelines.etapa_inicial_id, '
  'senao 1a etapa em_andamento por ordem), valida etapa ativa/pertencente ao pipeline e grava '
  'etapa_tipo. Nao deriva mais leads.status -- a coluna foi removida nesta mesma migration.';

-- 4) Corte da coluna legada em gestao_crm.leads.
alter table gestao_crm.leads drop constraint if exists leads_status_check;
alter table gestao_crm.leads drop column if exists status;

-- 5) motivos_status: mesma limpeza, ja prevista desde 20261002150000 (comentario da coluna
--    aplica_em). Sem `status`, o trigger/funcoes de sincronizacao (2.2) deixam de fazer sentido.
drop trigger if exists trg_crm_motivos_status_a_sync_aplica_em on gestao_crm.motivos_status;
drop function if exists gestao_crm.sync_motivo_status_aplica_em();
drop function if exists gestao_crm.crm_motivo_aplica_em_from_status(text);
drop function if exists gestao_crm.crm_motivo_status_from_aplica_em(text);

alter table gestao_crm.motivos_status drop constraint if exists motivos_status_status_check;
alter table gestao_crm.motivos_status drop constraint if exists motivos_status_status_nome_key;
alter table gestao_crm.motivos_status drop column if exists status;

alter table gestao_crm.motivos_status
  add constraint motivos_status_aplica_em_nome_key unique (aplica_em, nome);

notify pgrst, 'reload schema';
