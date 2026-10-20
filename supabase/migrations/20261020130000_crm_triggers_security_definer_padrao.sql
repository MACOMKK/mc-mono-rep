-- Nivel 2 da auditoria do CRM (2026-10-20): protect_crm_pipeline_sistema() e
-- validate_crm_pipeline_automacao() eram as 2 unicas funcoes de trigger do schema gestao_crm sem
-- `security definer`/`set search_path`, inconsistente com todas as outras (ex.
-- validate_etapa_pipeline_leads, ensure_veiculo_estoque_disponivel). Nao era exploravel hoje
-- (referencias sempre schema-qualificadas dentro das funcoes, nenhum acesso a objeto resolvido por
-- search_path implicito), mas padroniza para evitar divergencia e fica mais robusto a um futuro
-- `alter role ... set search_path` que mude o default da sessao. Nenhuma mudanca de logica.

create or replace function gestao_crm.protect_crm_pipeline_sistema()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
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
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create or replace function gestao_crm.validate_crm_pipeline_automacao()
returns trigger
language plpgsql
security definer
set search_path = gestao_crm, public
as $$
begin
  if not exists (
    select 1 from gestao_crm.etapas_pipeline e
    where e.id = new.etapa_destino_id and e.pipeline_id = new.pipeline_id
  ) then
    raise exception using errcode = '23514', message = 'A etapa destino nao pertence a este pipeline.';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
