-- Fecha 5 tabelas de gestao_intranet que estavam SEM RLS e com SELECT/INSERT/UPDATE/DELETE para
-- `authenticated`, num schema exposto pelo PostgREST (db_schema inclui gestao_intranet).
--
-- Achado da auditoria de arquitetura de 2026-11-11, confirmado em 2026-11-12 por simulacao
-- (`begin read only; set local role authenticated; ...`, sem gravar nada):
--   - leitura: acessos_ip_confiavel (1 linha), avisos_documentos (7), avisos_links (2) visiveis para
--     um uid ficticio sem colaborador vinculado; controle public.colaboradores (com RLS) = 0 linhas;
--   - escrita: EXPLAIN de INSERT/UPDATE/DELETE passa na checagem de permissao nas 5 tabelas
--     (controle negativo em gestao_ativos.ativos falha com permission denied, como esperado);
--   - REST com a anon key: 401 por privilegio (schema alcancavel) -- um JWT authenticated passaria.
--
-- Risco concreto: o signup publico esta aberto (disable_signup = false), entao qualquer pessoa pode
-- obter um JWT authenticated e gravar em gestao_intranet.acessos_ip_confiavel uma faixa como
-- 0.0.0.0/0. A intranet-api (verify_jwt = false) usa essa tabela para liberar acesso SEM LOGIN por IP
-- (getTrustedIpContext), com leitura em avisos, links, colaboradores, documentos, calendario,
-- conhecimento e feedback.
--
-- Causa raiz: 20260514194500_add_gestao_intranet_core.sql (linha 504) definiu
-- `alter default privileges in schema gestao_intranet grant select, insert, update, delete on tables
-- to authenticated`, entao toda tabela nova do schema ja nasce com esses grants; estas 5 foram
-- criadas depois sem `enable row level security`. (Ver PASSO OPCIONAL no fim deste arquivo.)
--
-- Por que nao quebra nada (verificado em 2026-11-12):
--   - nenhum frontend acessa estas tabelas via supabase-js (grep por `.from(` nos apps/packages);
--   - nenhuma esta na publicacao supabase_realtime;
--   - nao ha views nem funcoes SQL que as referenciem; os unicos triggers sao set_updated_at;
--   - todo acesso legitimo passa pela intranet-api (e pelo cron intranet-notifica-aniversariante),
--     que conectam via DATABASE_URL como `postgres` -- dono das tabelas e BYPASSRLS, entao RLS nao
--     se aplica a eles. Por isso NAO usamos `force row level security` (isso afetaria o dono).
--   - service_role mantem os grants (tambem e BYPASSRLS).
--
-- Duas camadas, de proposito (defesa em profundidade): RLS ligado sem nenhuma policy nega tudo para
-- anon/authenticated, e o revoke tira os grants que nunca deveriam ter existido.
--
-- Estado anterior (pg_class.relacl, identico nas 5 tabelas, em 2026-11-12):
--   {postgres=arwdDxtm/postgres,authenticated=arwd/postgres,service_role=arwd/postgres,authenticator=r/postgres}
--   relrowsecurity = false, 0 policies.
--
-- Rollback (restaura exatamente o estado anterior):
--
-- alter table gestao_intranet.acessos_ip_confiavel          disable row level security;
-- alter table gestao_intranet.avisos_documentos             disable row level security;
-- alter table gestao_intranet.avisos_links                  disable row level security;
-- alter table gestao_intranet.solicitacoes_alteracao_perfil disable row level security;
-- alter table gestao_intranet.template_aniversario          disable row level security;
-- grant select, insert, update, delete on
--   gestao_intranet.acessos_ip_confiavel,
--   gestao_intranet.avisos_documentos,
--   gestao_intranet.avisos_links,
--   gestao_intranet.solicitacoes_alteracao_perfil,
--   gestao_intranet.template_aniversario
-- to authenticated;
--
-- Verificacao pos-aplicacao (somente leitura; deve retornar erro 42501 ou 0 linhas em todas):
--
-- begin read only;
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
-- select count(*) from gestao_intranet.acessos_ip_confiavel;  -- esperado: permission denied
--
-- E conferir na intranet (logado e via IP confiavel): avisos com documentos/links anexos,
-- solicitacao de alteracao de perfil, tela de template de aniversario e acesso por rede liberada.

alter table gestao_intranet.acessos_ip_confiavel          enable row level security;
alter table gestao_intranet.avisos_documentos             enable row level security;
alter table gestao_intranet.avisos_links                  enable row level security;
alter table gestao_intranet.solicitacoes_alteracao_perfil enable row level security;
alter table gestao_intranet.template_aniversario          enable row level security;

revoke select, insert, update, delete on
  gestao_intranet.acessos_ip_confiavel,
  gestao_intranet.avisos_documentos,
  gestao_intranet.avisos_links,
  gestao_intranet.solicitacoes_alteracao_perfil,
  gestao_intranet.template_aniversario
from authenticated, anon;

-- PASSO OPCIONAL (nao aplicado aqui -- decidir separadamente):
-- O default privilege da causa raiz continua ativo, entao a proxima tabela criada em
-- gestao_intranet sem `enable row level security` repete o problema. Remover:
--
--   alter default privileges for role postgres in schema gestao_intranet
--     revoke select, insert, update, delete on tables from authenticated;
--
-- Trade-off: tabelas novas que precisem de Realtime (postgres_changes avalia RLS como
-- authenticated) passariam a exigir `grant select ... to authenticated` explicito na propria
-- migration. Alternativa sem mudar default privileges: regra de revisao "toda tabela nova em
-- gestao_* nasce com enable row level security", checada pelo advisor de seguranca do Supabase
-- (rls_disabled_in_public) antes de cada deploy.
