-- A migration 20260924120000_remove_crm_lead_previsao_fechamento.sql ja reescreve
-- gestao_crm.register_lead_change_history() sem a referencia a previsao_fechamento, mas em
-- alguns ambientes (HOMOLOG) ela foi aplicada com o SQL na versao anterior a essa correcao
-- (a coluna previsao_fechamento so foi removida em gestao_crm.leads/atendimentos, sem a
-- funcao ser reescrita), quebrando qualquer UPDATE em gestao_crm.leads com
-- "record "new" has no field "previsao_fechamento"". Migrations ja aplicadas nao sao
-- reeditadas -- esta migration apenas reaplica a definicao correta da funcao.

create or replace function gestao_crm.register_lead_change_history()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  history_type text;
  history_description text;
begin
  if new.responsavel_id is distinct from old.responsavel_id then
    history_type = 'atribuicao_lead';
    history_description = case
      when new.responsavel_id is null then 'Responsavel removido do lead.'
      else 'Responsavel do lead alterado.'
    end;
  elsif new.nome is distinct from old.nome
     or new.telefone is distinct from old.telefone
     or new.email is distinct from old.email
     or new.status is distinct from old.status
     or new.modelo_interesse is distinct from old.modelo_interesse
     or new.motivo_perda is distinct from old.motivo_perda
     or new.observacoes is distinct from old.observacoes then
    history_type = 'atualizacao_lead';
    history_description = 'Dados comerciais do lead atualizados.';
  else
    return new;
  end if;

  insert into gestao_crm.historico_atendimentos (
    cliente_id,
    lead_id,
    tipo,
    descricao,
    entidade,
    entidade_id,
    status,
    metadados
  ) values (
    new.cliente_id,
    new.id,
    history_type,
    history_description,
    'Lead',
    new.id,
    new.status,
    jsonb_build_object(
      'antes', to_jsonb(old),
      'depois', to_jsonb(new)
    )
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
