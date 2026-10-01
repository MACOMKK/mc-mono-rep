-- Remove a tabela antiga do sino da intranet. Desde 20261001120000 a intranet grava e le em
-- notificacoes.notificacoes (sistema = 'intranet'); o historico antigo foi descartado de proposito.
-- Rodar so depois de o intranet-api novo estar em producao (o antigo ainda grava aqui).

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_intranet'
      and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime drop table gestao_intranet.notificacoes;
  end if;
end
$$;

-- O job antigo ja foi desagendado pela migration anterior; a funcao ficou orfa.
drop function if exists gestao_intranet.limpar_notificacoes_antigas();

drop table if exists gestao_intranet.notificacoes;
