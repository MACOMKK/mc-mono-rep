-- Fase 2.2 (6/7) do PLANO_LEADS_PIPELINE: o historico do lead registra a troca de etapa.
--
-- - A linha e gravada quando a etapa OU o status mudam. Antes era so o status; mover entre
--   uma etapa de sistema e uma etapa livre (que pode manter o status) nao deixava rastro.
-- - Descricao com o nome das etapas: "Etapa alterada de Qualificado para Negociação."
--   (antes: "Status alterado de qualificado para negociacao."). A Timeline do cliente mostra
--   a descricao como titulo; nenhum codigo le esse texto.
-- - historico_atendimentos.status continua com leads.status (texto) e os metadados mantem
--   status_anterior/status_novo, para o historico ja gravado continuar comparavel. Entram
--   etapa_anterior_id/_nome, etapa_nova_id/_nome e pipeline_id.
-- O resto (atribuicao_lead e "Dados comerciais do lead atualizados.") nao muda.

create or replace function gestao_crm.register_lead_change_history()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  snapshot jsonb := jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new));
  etapa_changed boolean := new.etapa_id is distinct from old.etapa_id or new.status is distinct from old.status;
  etapa_anterior_nome text;
  etapa_nova_nome text;
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
        coalesce(etapa_anterior_nome, old.status),
        coalesce(etapa_nova_nome, new.status)
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
  'Fonte unica do historico de alteracoes do lead (troca de responsavel, troca de etapa/status e dados '
  'comerciais). Cobre todos os caminhos que atualizam gestao_crm.leads: tela (crm-api), '
  'apply_activity_outcome(), apply_venda_outcome() e cancel_venda. A linha de etapa leva nos metadados '
  'status_anterior/status_novo e etapa_anterior_*/etapa_nova_*. Nao grave historico de troca de etapa ou '
  'status na crm-api nem em outra funcao.';

notify pgrst, 'reload schema';
