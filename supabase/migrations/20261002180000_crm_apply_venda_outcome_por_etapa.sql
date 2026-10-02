-- Fase 2.2 (4/7) do PLANO_LEADS_PIPELINE: fechar uma venda move o lead para a etapa de
-- sistema 'convertido' do pipeline dele (etapa_id), em vez de gravar status = 'convertido'.
-- trg_crm_leads_a_sync_etapa deriva o status a partir da etapa.
--
-- Pipeline sem a etapa de sistema 'convertido': cai na primeira etapa ativa tipo 'ganho' do
-- pipeline (mesma regra de apply_activity_outcome(venda_realizada)); erro se nao houver.
-- Multiplas etapas de ganho por pipeline seguem fora de escopo.
--
-- O resto da funcao (baixa do veiculo, GUC, historico 'venda_fechada') nao muda.

create or replace function gestao_crm.apply_venda_outcome()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  etapa_ganho_id uuid;
begin
  update gestao_crm.veiculos_estoque
  set status = 'vendido'
  where id = new.veiculo_estoque_id;

  select coalesce(
    (select e.id from gestao_crm.etapas_pipeline e
     where e.pipeline_id = l.pipeline_id and e.chave_sistema = 'convertido'),
    (select e.id from gestao_crm.etapas_pipeline e
     where e.pipeline_id = l.pipeline_id and e.tipo = 'ganho' and e.ativo
     order by e.ordem
     limit 1)
  )
  into etapa_ganho_id
  from gestao_crm.leads l
  where l.id = new.lead_id;

  if etapa_ganho_id is null then
    raise exception using
      errcode = '23514',
      message = 'O pipeline do lead nao possui etapa do tipo ganho.';
  end if;

  perform set_config('gestao_crm.allow_convertido', 'on', true);

  update gestao_crm.leads
  set etapa_id = etapa_ganho_id, motivo_status_id = new.motivo_status_id
  where id = new.lead_id;

  insert into gestao_crm.historico_atendimentos (
    cliente_id, lead_id, tipo, descricao, entidade, entidade_id, status, metadados, criado_por
  ) values (
    new.cliente_id,
    new.lead_id,
    'venda_fechada',
    format('Venda fechada no valor de %s.', new.valor_final),
    'Venda',
    new.id,
    'convertido',
    jsonb_build_object(
      'venda_id', new.id,
      'proposta_id', new.proposta_id,
      'veiculo_estoque_id', new.veiculo_estoque_id,
      'valor_final', new.valor_final,
      'vendedor_id', new.vendedor_id
    ),
    new.criado_por
  );

  return new;
end;
$$;

comment on function gestao_crm.apply_venda_outcome() is
  'Fecha o ciclo de venda: baixa o veiculo do estoque, seta gestao_crm.allow_convertido e move o lead para a '
  'etapa de sistema convertido do pipeline dele (fallback: primeira etapa ativa tipo ganho) -- a trava de '
  'prepare_lead_phase1() so libera a entrada em etapa tipo ganho por essa flag -- e registra o evento no '
  'historico. A sincronizacao de gestao_crm.clientes_crm fica no trigger sync_cliente_status_relacionamento() '
  '-- nenhuma regra duplicada.';

notify pgrst, 'reload schema';
