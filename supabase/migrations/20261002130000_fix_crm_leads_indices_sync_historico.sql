-- Fase 0 do PLANO_LEADS_PIPELINE: corrige 3 problemas atuais de gestao_crm.leads antes da
-- migracao para etapas de pipeline.
--
-- 1) Indices parciais ainda filtravam pelo status antigo 'proposta'. Foram recriados pela
--    ultima vez em 20260722100000_add_crm_lead_triagem.sql e nunca refeitos depois do rename
--    para 'negociacao' (20260912120000). Efeito: lead em 'negociacao' nao contava na regra
--    "1 lead ativo por cliente" nem entrava no indice de SLA.
--    Se a recriacao do indice unico falhar por duplicidade, ja existem clientes com mais de um
--    lead ativo (um deles em 'negociacao'). Para listar:
--      select cliente_id, array_agg(id), array_agg(status) from gestao_crm.leads
--      where status in ('novo','tentativa_contato','em_contato','qualificado','negociacao')
--      group by cliente_id having count(*) > 1;
--
-- 2) trg_sync_cliente_status_on_lead_convertido (20260806090000) nunca foi removido quando
--    trg_crm_leads_sync_cliente_status (20260918120000) centralizou a regra. Os dois rodavam a
--    cada conversao. O central e um superconjunto do antigo, entao basta dropar o antigo.
--
-- 3) Troca de status gravava duas linhas em historico_atendimentos: uma pelo trigger
--    register_lead_change_history ("Dados comerciais do lead atualizados.") e outra pela crm-api
--    ("Status alterado de X para Y."). A API so cobria edicao pela tela; atividade, venda e
--    cancelamento de venda so passavam pelo trigger. O trigger passa a ser a fonte unica:
--    grava a linha de status com status_anterior/status_novo/motivo_status_id e a crm-api deixa
--    de gravar a dela. Troca de responsavel continua em linha propria (atribuicao_lead), mesmo
--    quando acontece junto com a troca de status.

-- 1) Indices parciais
drop index if exists gestao_crm.idx_crm_leads_cliente_ativo_unique;
create unique index idx_crm_leads_cliente_ativo_unique
  on gestao_crm.leads (cliente_id)
  where status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');

drop index if exists gestao_crm.idx_crm_leads_sla_primeiro_contato;
create index idx_crm_leads_sla_primeiro_contato
  on gestao_crm.leads (sla_primeiro_contato_em)
  where primeiro_contato_em is null
    and status in ('novo', 'tentativa_contato', 'em_contato', 'qualificado', 'negociacao');

-- 2) Sincronizacao duplicada do cliente
drop trigger if exists trg_sync_cliente_status_on_lead_convertido on gestao_crm.leads;
drop function if exists gestao_crm.sync_cliente_status_on_lead_convertido();

-- 3) Historico: fonte unica no trigger
create or replace function gestao_crm.register_lead_change_history()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  snapshot jsonb := jsonb_build_object('antes', to_jsonb(old), 'depois', to_jsonb(new));
  status_changed boolean := new.status is distinct from old.status;
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

  if status_changed then
    insert into gestao_crm.historico_atendimentos (
      cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados
    ) values (
      new.cliente_id,
      new.id,
      'atualizacao_lead',
      format('Status alterado de %s para %s.', old.status, new.status),
      'Lead',
      new.id,
      new.status,
      snapshot || jsonb_build_object(
        'status_anterior', old.status,
        'status_novo', new.status,
        'motivo_status_id', new.motivo_status_id
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
  'Fonte unica do historico de alteracoes do lead (troca de responsavel, troca de status e dados '
  'comerciais). Cobre todos os caminhos que atualizam gestao_crm.leads: tela (crm-api), '
  'apply_activity_outcome(), apply_venda_outcome() e cancel_venda. Nao grave historico de troca de '
  'status na crm-api nem em outra funcao.';

notify pgrst, 'reload schema';
