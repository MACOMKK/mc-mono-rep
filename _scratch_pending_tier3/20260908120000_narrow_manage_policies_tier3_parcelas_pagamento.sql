-- Corrige multiple_permissive_policies (advisor de performance) - Tier 3, caso 3
-- (gestao_servicos.parcelas_pagamento). Fix hibrido: SELECT segue o padrao
-- mecanico do Tier 2 (subconjunto estrito); INSERT exige fusao genuina de OR
-- (populacoes disjuntas por design); UPDATE/DELETE ja nao tinham sobreposicao.
--
-- Estado original (3 policies, verificado via pg_policies em 2026-09-08):
--
-- create policy servicos_parcelas_select on gestao_servicos.parcelas_pagamento
--   for select to authenticated
--   using (
--     exists (
--       select 1 from gestao_servicos.solicitacoes_pagamento sp
--       where sp.id = parcelas_pagamento.solicitacao_id
--         and servicos_can_access_solicitacao(sp.solicitante_id, sp.aprovador_destino_id, sp.departamento_id, sp.forma_pagamento, sp.unidade_id)
--     )
--   );
--   -- NAO TOCADA nesta migration.
--
-- create policy servicos_parcelas_insert_solicitante on gestao_servicos.parcelas_pagamento
--   for insert to authenticated
--   with check (
--     exists (
--       select 1 from gestao_servicos.solicitacoes_pagamento sp
--       where sp.id = parcelas_pagamento.solicitacao_id
--         and sp.solicitante_id = current_colaborador_id()
--         and sp.status = 'pendente'
--     )
--   );
--
-- create policy servicos_parcelas_write_financeiro on gestao_servicos.parcelas_pagamento
--   for all to authenticated
--   using (
--     exists (
--       select 1 from gestao_servicos.solicitacoes_pagamento sp
--       where sp.id = parcelas_pagamento.solicitacao_id
--         and case
--               when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
--               else servicos_is_pagador()
--             end
--     )
--   )
--   with check ( -- mesma condicao de using
--     exists (
--       select 1 from gestao_servicos.solicitacoes_pagamento sp
--       where sp.id = parcelas_pagamento.solicitacao_id
--         and case
--               when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
--               else servicos_is_pagador()
--             end
--     )
--   );
--
-- Analise por comando:
--
-- SELECT: a condicao de write_financeiro (financeiro/pagador, com regra especial
-- pra forma_pagamento='dinheiro') e' subconjunto estrito da condicao de
-- servicos_parcelas_select (servicos_can_access_solicitacao inclui exatamente
-- esse mesmo termo, mais dono/aprovador/colega de setor-unidade) - padrao
-- mecanico do Tier 2. Fix: remover o SELECT do escopo de write_financeiro
-- (vira INSERT/UPDATE/DELETE), deixando servicos_parcelas_select como unica dona.
--
-- INSERT: servicos_parcelas_insert_solicitante (dono da solicitacao-mae E
-- status pendente) e o ramo de insert de write_financeiro (financeiro/pagador)
-- sao populacoes DISJUNTAS por design (quem propoe o parcelamento na criacao x
-- quem o redefine depois de aprovado) - nao ha subconjunto. Fix: fundir em uma
-- unica policy de INSERT com OR das duas condicoes (Postgres ja avaliava as
-- duas em OR via 2 policies separadas - fundir em 1 e' identico em efeito,
-- so remove a duplicidade contada pelo advisor).
--
-- UPDATE/DELETE: so write_financeiro ja se aplicava (nenhuma outra policy
-- cobria esses comandos) - so separa em comandos dedicados, mecanico.
--
-- Blast radius: a Edge Function servicos-api conecta direto no Postgres via
-- DATABASE_URL (sem FORCE ROW LEVEL SECURITY) - a autorizacao real de
-- criar/editar parcelas e' feita em JS (isPagador/ensureParcelaAccess). Este
-- RLS e' defesa em profundidade; nenhum comportamento do app muda com esta
-- migration. Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B, Tier 3.

drop policy servicos_parcelas_insert_solicitante on gestao_servicos.parcelas_pagamento;
drop policy servicos_parcelas_write_financeiro on gestao_servicos.parcelas_pagamento;

create policy servicos_parcelas_insert on gestao_servicos.parcelas_pagamento
  for insert to authenticated
  with check (
    exists (
      select 1 from gestao_servicos.solicitacoes_pagamento sp
      where sp.id = parcelas_pagamento.solicitacao_id
        and sp.solicitante_id = current_colaborador_id()
        and sp.status = 'pendente'
    )
    or exists (
      select 1 from gestao_servicos.solicitacoes_pagamento sp
      where sp.id = parcelas_pagamento.solicitacao_id
        and case
              when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
              else servicos_is_pagador()
            end
    )
  );

create policy servicos_parcelas_update on gestao_servicos.parcelas_pagamento
  for update to authenticated
  using (
    exists (
      select 1 from gestao_servicos.solicitacoes_pagamento sp
      where sp.id = parcelas_pagamento.solicitacao_id
        and case
              when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
              else servicos_is_pagador()
            end
    )
  )
  with check (
    exists (
      select 1 from gestao_servicos.solicitacoes_pagamento sp
      where sp.id = parcelas_pagamento.solicitacao_id
        and case
              when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
              else servicos_is_pagador()
            end
    )
  );

create policy servicos_parcelas_delete on gestao_servicos.parcelas_pagamento
  for delete to authenticated
  using (
    exists (
      select 1 from gestao_servicos.solicitacoes_pagamento sp
      where sp.id = parcelas_pagamento.solicitacao_id
        and case
              when sp.forma_pagamento = 'dinheiro' and servicos_restringe_visibilidade_dinheiro() then servicos_is_financeiro()
              else servicos_is_pagador()
            end
    )
  );
