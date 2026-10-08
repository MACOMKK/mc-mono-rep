-- Fase 2.7 (passo 5/5, final) do PLANO_LEADS_PIPELINE.local.md: trava de integridade que ate
-- aqui so valia pra etapas de sistema (chave_sistema), agora generalizada pra qualquer etapa:
--   1. Todo pipeline precisa manter pelo menos 1 etapa ativa tipo='ganho' e 1 tipo='perdido'
--      (apply_activity_outcome/apply_venda_outcome dependem disso pro fallback quando nao ha
--      chave_sistema) -- bloqueia inativar/trocar tipo/excluir a ultima do tipo.
--   2. Etapa referenciada como pipelines.etapa_inicial_id, etapa_cancelamento_id ou destino em
--      pipeline_automacoes nao pode ser inativada nem excluida sem antes trocar a referencia
--      (exclusao ja cai em FK, mas inativacao nao -- a linha continua existindo).
-- Etapas de sistema continuam adicionalmente travadas por protect_crm_pipeline_sistema()
-- (nao mudou); esta trigger roda em paralelo e vale tambem pra elas.

create or replace function gestao_crm.validate_crm_pipeline_etapa_integridade()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
declare
  etapa_alvo gestao_crm.etapas_pipeline%rowtype;
  vai_inativar boolean;
  vai_trocar_tipo boolean;
  outras_do_tipo integer;
begin
  etapa_alvo := old;
  vai_inativar := tg_op = 'UPDATE' and not new.ativo and old.ativo;
  vai_trocar_tipo := tg_op = 'UPDATE' and new.tipo is distinct from old.tipo;

  if tg_op = 'DELETE' or vai_inativar or vai_trocar_tipo then
    if exists (
      select 1 from gestao_crm.pipelines p
      where p.etapa_inicial_id = etapa_alvo.id or p.etapa_cancelamento_id = etapa_alvo.id
    ) then
      raise exception using errcode = '23514', message =
        'Esta etapa esta configurada como etapa inicial ou de cancelamento do pipeline. Troque a configuracao antes de excluir/inativar/trocar o tipo.';
    end if;

    if exists (
      select 1 from gestao_crm.pipeline_automacoes pa where pa.etapa_destino_id = etapa_alvo.id
    ) then
      raise exception using errcode = '23514', message =
        'Esta etapa esta configurada como destino de uma automacao. Remova ou reconfigure a automacao antes de excluir/inativar/trocar o tipo.';
    end if;
  end if;

  if etapa_alvo.tipo in ('ganho', 'perdido') and (tg_op = 'DELETE' or vai_inativar or vai_trocar_tipo) then
    select count(*) into outras_do_tipo
    from gestao_crm.etapas_pipeline e
    where e.pipeline_id = etapa_alvo.pipeline_id
      and e.tipo = etapa_alvo.tipo
      and e.ativo
      and e.id <> etapa_alvo.id;

    if outras_do_tipo = 0 then
      raise exception using errcode = '23514', message = format(
        'O pipeline precisa manter pelo menos uma etapa ativa do tipo %s.', etapa_alvo.tipo
      );
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_crm_etapas_pipeline_validate_integridade on gestao_crm.etapas_pipeline;
create trigger trg_crm_etapas_pipeline_validate_integridade
before update or delete on gestao_crm.etapas_pipeline
for each row execute function gestao_crm.validate_crm_pipeline_etapa_integridade();

grant execute on function gestao_crm.validate_crm_pipeline_etapa_integridade() to authenticated, service_role;

comment on function gestao_crm.validate_crm_pipeline_etapa_integridade() is
  'Fase 2.7 do PLANO_LEADS_PIPELINE: generaliza para qualquer etapa (nao so chave_sistema) duas '
  'travas: (1) pipeline sempre com >=1 etapa ativa tipo ganho e >=1 tipo perdido -- bloqueia '
  'excluir/inativar/trocar tipo da ultima; (2) etapa referenciada em pipelines.etapa_inicial_id/'
  'etapa_cancelamento_id ou pipeline_automacoes.etapa_destino_id nao pode ser excluida/inativada/'
  'trocar tipo sem reconfigurar a referencia primeiro.';

notify pgrst, 'reload schema';
