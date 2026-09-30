-- Corrige gestao_crm.protect_crm_pipeline_sistema(): a funcao e compartilhada
-- pelos triggers de gestao_crm.pipelines e gestao_crm.etapas_pipeline, mas
-- combinava tg_table_name com acesso a coluna especifica de uma tabela numa
-- unica expressao booleana (`tg_table_name = 'pipelines' and old.padrao`,
-- `tg_table_name = 'etapas_pipeline' and old.chave_sistema is not null`).
-- O plpgsql resolve os campos do record OLD ao preparar essa expressao unica,
-- independente do curto-circuito do AND em tempo de execucao, entao ao
-- excluir uma etapa (OLD do tipo etapas_pipeline, sem coluna "padrao") o
-- acesso a old.padrao estourava "record 'old' has no field 'padrao'" — e o
-- mesmo aconteceria ao excluir um pipeline, acessando old.chave_sistema
-- (coluna que nao existe em pipelines). Isolar cada acesso de coluna num IF
-- aninhado, so alcancado quando tg_table_name ja confirma a tabela certa,
-- resolve isso: a instrucao interna so e executada (e so precisa resolver o
-- campo) quando o record OLD realmente tem essa coluna.

create or replace function gestao_crm.protect_crm_pipeline_sistema()
returns trigger
language plpgsql
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
