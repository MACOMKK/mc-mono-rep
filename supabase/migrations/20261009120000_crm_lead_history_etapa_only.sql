-- Fase 2.7 (PLANO_LEADS_PIPELINE.local.md), "inversao da sync": leads.status agora e 100%
-- derivado de etapa_id (20261008190000_crm_inversao_sync_status_etapa.sql). Toda troca de etapa
-- sempre muda etapa_id, entao a comparacao extra por status em register_lead_change_history()
-- (adicionada na fase 2.2 para pegar o caso de mover entre uma etapa de sistema e uma etapa
-- livre que preservava o mesmo status) ficou redundante -- etapa_id ja cobre esse caso sozinho.
--
-- Tambem troca o fallback de texto (usado so quando a etapa antiga/nova foi apagada do banco)
-- de old.status/new.status para um rotulo generico a partir de etapa_tipo, ja que status deixou
-- de ser uma fonte de informacao independente da etapa.

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
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados
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
      new.status,
      snapshot
    );
  end if;

  if etapa_changed then
    select nome into etapa_anterior_nome from gestao_crm.etapas_pipeline where id = old.etapa_id;
    select nome into etapa_nova_nome from gestao_crm.etapas_pipeline where id = new.etapa_id;

    insert into gestao_crm.historico_atendimentos (
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados
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
      new.status,
      snapshot || jsonb_build_object(
        'status_anterior', old.status,
        'status_novo', new.status,
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
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados
    ) values (
      new.cliente_id,
      new.id,
      'atualizacao_lead',
      'Dados comerciais do lead atualizados.',
      'Lead',
      new.id,
      new.status,
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
  'so por etapa_id (status e 100% derivado dele desde a inversao da sync, fase 2.7). A linha de '
  'etapa leva nos metadados status_anterior/status_novo (so para historico ja gravado continuar '
  'comparavel) e etapa_anterior_*/etapa_nova_*. Nao grave historico de troca de etapa ou status '
  'na crm-api nem em outra funcao.';

notify pgrst, 'reload schema';
