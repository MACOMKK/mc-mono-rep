-- Corrige multiple_permissive_policies (advisor de performance) - Tier 3, caso 2
-- (gestao_servicos.solicitacoes_pagamento, comando UPDATE).
--
-- Estado original (2 policies de UPDATE, verificado via pg_policies em 2026-09-08):
--
-- create policy servicos_solicitacoes_update_aprovador on gestao_servicos.solicitacoes_pagamento
--   for update to authenticated
--   using (
--     servicos_is_financeiro()
--     or (servicos_module_role() = 'aprovador' and aprovador_destino_id = current_colaborador_id())
--   )
--   with check (
--     servicos_is_financeiro()
--     or (servicos_module_role() = 'aprovador' and aprovador_destino_id = current_colaborador_id())
--   );
--
-- create policy servicos_solicitacoes_update_solicitante on gestao_servicos.solicitacoes_pagamento
--   for update to authenticated
--   using (
--     servicos_has_access()
--     and solicitante_id = current_colaborador_id()
--     and status = 'pendente'
--   )
--   with check (
--     solicitante_id = current_colaborador_id()
--     and status = 'pendente'
--   );
--
-- As duas condicoes sao populacoes disjuntas por design (dono editando enquanto
-- pendente x aprovador/financeiro decidindo status) - nao ha relacao de
-- subconjunto. Mas o Postgres ja avalia policies permissivas do mesmo comando
-- em OR, tanto para USING quanto para WITH CHECK, de forma independente uma da
-- outra (nao "so o WITH CHECK da policy cujo USING bateu" - sao dois ORs
-- separados). Ou seja, fundir em uma unica policy com
-- using = OR dos dois USING e with_check = OR dos dois WITH CHECK e'
-- matematicamente identico ao que ja acontece hoje com as 2 policies separadas -
-- nao muda nenhum comportamento, so remove a duplicidade contada pelo advisor.
--
-- Blast radius: a Edge Function servicos-api conecta direto no Postgres via
-- DATABASE_URL (sem FORCE ROW LEVEL SECURITY) - a autorizacao real de
-- aprovacao/edicao de solicitacoes e' feita em JS (isFinanceiro/isPagador/
-- canAccessSolicitacao). Este RLS e' defesa em profundidade; nenhum
-- comportamento do app muda com esta migration.
--
-- Achado a parte, FORA do escopo desta migration: "servicos_solicitacoes_update_
-- solicitante" e a policy de INSERT desta tabela ainda usam servicos_has_access()
-- (checagem antiga, so nivel de sistema), enquanto o resto do modulo ja migrou
-- para servicos_module_role/servicos_is_pagador/servicos_can_access_solicitacao.
-- Corrigir isso muda semantica de permissao de verdade (nao e' neutro como esta
-- fusao de performance) - registrado como debito tecnico separado, nao tratado
-- aqui. Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 3.

drop policy servicos_solicitacoes_update_aprovador on gestao_servicos.solicitacoes_pagamento;
drop policy servicos_solicitacoes_update_solicitante on gestao_servicos.solicitacoes_pagamento;

create policy servicos_solicitacoes_update on gestao_servicos.solicitacoes_pagamento
  for update to authenticated
  using (
    servicos_is_financeiro()
    or (servicos_module_role() = 'aprovador' and aprovador_destino_id = current_colaborador_id())
    or (servicos_has_access() and solicitante_id = current_colaborador_id() and status = 'pendente')
  )
  with check (
    servicos_is_financeiro()
    or (servicos_module_role() = 'aprovador' and aprovador_destino_id = current_colaborador_id())
    or (solicitante_id = current_colaborador_id() and status = 'pendente')
  );
