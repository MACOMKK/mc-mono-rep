-- 20260917030000 ja rodou neste banco antes desta correcao existir: o trigger
-- auto_create_servicos_permissoes() e o backfill de la inseriram linhas
-- 'oficina' usando o default da coluna (papel = 'usuario'), nao 'nenhum' como
-- o comentario do arquivo pretendia. Como aquela migration ja foi aplicada,
-- so editar o arquivo (feito, para deixar instalacoes futuras/reset corretas)
-- nao corrige o dado ja gravado -- precisa de uma migration nova para isso.
--
-- Oficina e' um modulo novo (checklist ainda em construcao, sem uso real em
-- producao), entao nao ha estado genuino a preservar: todo mundo volta para
-- 'nenhum', sem excecao entre quem ja tinha a linha e quem tera dai pra
-- frente. Financeiro fica intocado (continua com default/fallback 'usuario').

-- 1) Corrige os dados ja gravados por 20260917030000 nesta instancia.
update gestao_servicos.permissoes_modulo
set papel = 'nenhum'
where modulo = 'oficina'
  and papel = 'usuario';

-- 2) Fallback da funcao SQL usada pelas RLS policies de Oficina
-- (servicos_oficina_pode_ver/servicos_oficina_pode_editar). Antes retornava
-- 'usuario' sempre que faltasse linha em permissoes_modulo, pra qualquer
-- modulo; agora e' condicional por modulo.
create or replace function public.servicos_module_role(p_modulo text default 'financeiro')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.servicos_access_level() = 'admin' then 'admin'
    when public.servicos_access_level() is null then null
    else coalesce(
      (select pm.papel
       from gestao_servicos.permissoes_modulo pm
       where pm.colaborador_id = public.current_colaborador_id()
         and pm.modulo = p_modulo),
      case when p_modulo = 'oficina' then 'nenhum' else 'usuario' end
    )
  end;
$$;
