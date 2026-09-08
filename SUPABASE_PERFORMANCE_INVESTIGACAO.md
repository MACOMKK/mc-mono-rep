# Investigação: alerta de exaustão de recursos no Supabase

> Investigação iniciada em 2026-09-04, disparada pelo alerta do dashboard Supabase: "Your project
> is currently exhausting multiple resources, and its performance is affected". Feita via
> Supabase CLI (`npx supabase db advisors` / `db query`, linkado ao projeto `jbqacvlpgqhpvncjhoom`
> com as credenciais do `.env.local` raiz), 100% somente-leitura — nenhuma mudança de schema,
> dado ou configuração foi feita nesta etapa.

## Resumo

O consumo de recursos do banco **não vem do volume de dados de negócio** (tabelas de leads,
mensagens de chat, notificações etc. têm poucos milhares de linhas no total). Vem de **churn de
infraestrutura**: dois itens somam ~85% de todo o tempo de CPU do banco desde o último reset de
estatísticas (`stats_reset = 2026-04-30`, ~127 dias de amostra, 12,3 milhões de transações
commitadas no período):

| #   | Causa                                                 | % do tempo total de banco | Chamadas  | Tempo total acumulado |
| --- | ----------------------------------------------------- | ------------------------- | --------- | --------------------- |
| 1   | Decodificação de WAL pelo Realtime (`supabase_admin`) | 48,0%                     | 3.296.141 | ~24,1 milhões de ms   |
| 2   | Limpeza interna do `pg_net` (`net._http_response`)    | 36,6%                     | 108.937   | ~18,4 milhões de ms   |

## 1. Realtime decodifica o WAL inteiro, não só as tabelas publicadas

A query `SELECT wal->>'type', wal->>'schema'...` (rodada pelo usuário `supabase_admin`, motor do
Realtime) processa **toda transação commitada no banco**, não apenas as das 28 tabelas na
publicação `supabase_realtime` — o Realtime decodifica o WAL completo via `wal2json` e só filtra
pelas tabelas publicadas depois. Por isso o número de chamadas (3,3M) é próximo do total de
transações do banco no período (12,3M), e não do volume de escrita nas tabelas com Realtime
habilitado.

**Conferido:** somei `n_tup_ins + n_tup_upd + n_tup_del` das 28 tabelas publicadas — o total é
**~11.000 escritas** em 127 dias. As maiores são `gestao_intranet.notificacoes` (6.548) e
`gestao_servicos.notificacoes` (1.073); as tabelas de chat (`gestao_comunicacao.*`) têm uso
residual (ex.: `mensagens` = 59 escritas, `mensagens_diretas` = 155). Ou seja: **o app de chat
(`comunicacao`) não é o vilão** — é pouquíssimo usado ainda.

### O que de fato gera as 12,3M transações

Escritas em tabelas **fora** da publicação Realtime, por ordem de volume:

| Tabela                                                 | Escritas (127 dias) | Origem                                             |
| ------------------------------------------------------ | ------------------- | -------------------------------------------------- |
| `net.http_request_queue`                               | 300.598             | Fila interna do `pg_net` para cada `net.http_post` |
| `net._http_response`                                   | 255.082             | Resposta de cada chamada HTTP assíncrona           |
| `cron.job_run_details`                                 | 160.953             | Log de cada execução de `pg_cron`                  |
| `realtime.subscription`                                | 45.308              | Cada `subscribe`/`unsubscribe` de canal Realtime   |
| `public.push_subscriptions`                            | 12.560              | Push notifications                                 |
| `auth.refresh_tokens` / `auth.sessions` / `auth.users` | ~21.500             | Atividade normal de login/sessão                   |

`realtime.subscription` com 45.308 escritas em 127 dias (~357/dia, uma a cada ~4 min) chamou
atenção — investiguei o código dos hooks de Realtime à procura de um loop de resubscribe:

- `apps/comunicacao/src/hooks/usePresence.js` e `useTypingIndicator.js` implementam
  **reconexão manual proposital**: o canal de presence do Realtime fecha sozinho por idle
  timeout do lado do servidor (documentado em comentário no próprio código) e o cliente não
  re-adere automaticamente — por isso os hooks fazem `removeChannel` + `attachChannel` de novo
  a cada `CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT`, com guarda contra reentrância (`reconnecting`) e
  contra reconectar um canal que já devia sumir (`room.closing`). **Cada ciclo de reconexão grava
  em `realtime.subscription`.** É um workaround intencional e já revisado (não é bug novo), mas é
  a explicação mais provável do churn dessa tabela — todo usuário com o app `comunicacao` aberto
  gera esse ciclo periodicamente mesmo sem interação nenhuma (canal de presence é global, monta
  no load do app).
- `apps/crm/src/hooks/useCrmRealtime.js` usa um canal único (`crm-realtime`) sem esse padrão de
  reconexão manual — não é fonte relevante do churn.
- Não foi possível revisar `NotificationsBell.jsx` (servicos), `useIntranetRealtime.js` e
  `Header.jsx` (intranet) neste passe — candidatos a checar se o item 1 continuar alto após as
  correções abaixo.

## 2. `pg_net` — limpeza cara e alta frequência de `net.http_post`

A tabela `net._http_response` está pequena hoje (58 MB, 360 linhas, `n_dead_tup = 0` — autovacuum
em dia), mas a rotina de limpeza interna da extensão (`DELETE ... WHERE created < now() -
interval` em lote) tem **médio de 169ms por execução**, rodada ~109 mil vezes — caro por chamada,
não por acúmulo de dados. Isso é alimentado pelo volume de `net.http_post`, chamado pelos jobs de
`pg_cron`:

| jobid | Schedule                   | Function                           | Chamadas estimadas (127 dias) |
| ----- | -------------------------- | ---------------------------------- | ----------------------------- |
| 13    | `* * * * *` (todo minuto)  | `processa-fila-email`              | ~183.000                      |
| 14    | `0 * * * *` (hora em hora) | `servicos-lembrete-aprovacoes`     | ~3.050                        |
| 15    | `*/15 * * * *`             | `security-alerta-picos-login`      | ~12.190                       |
| 16    | `0 8 * * *` (diário)       | `intranet-notifica-aniversariante` | ~127                          |

`processa-fila-email` a cada minuto, rodando há ~127 dias, é a origem dominante — bate
aproximadamente com as 159.592 chamadas de `net.http_post` vistas em `pg_stat_statements`.

Não encontrei triggers/functions de banco chamando `net.http_post` fora desses 4 jobs de cron
(`information_schema.triggers` e `information_schema.routines` não retornaram nenhum outro
resultado) — ou seja, não há uma feature vazando chamadas HTTP por engano, é o volume esperado do
design atual (fila de e-mail no pooling de 1 minuto).

## 3. Achados secundários dos advisors (`supabase db advisors --type performance`)

86 findings de performance, todos ligados a RLS:

- **67x `multiple_permissive_policies`** — mais de uma policy permissiva para a mesma
  ação/role na mesma tabela (Postgres avalia todas e faz OR — custo redundante).
- **19x `auth_rls_initplan`** — policies que chamam `auth.<função>()` direto (ex.:
  `public.acessos_usuario_sistema.acessos_read_self_or_admin`,
  `gestao_relatorio.avisos_relatorios.avisos_relatorios_select_admin_or_permitted`) em vez de
  `(select auth.<função>())`, forçando reavaliação por linha.

Não aparecem no topo do `pg_stat_statements` porque o custo é diluído entre muitas queries
pequenas — não é a causa do alerta atual, mas é dívida técnica estrutural que soma custo por
query conforme o tráfego cresce.

## Recomendações + análise de risco (nenhuma aplicada ainda)

Critério de risco: chance de quebrar algo em produção (erro visível pro usuário, dado perdido,
feature parando de funcionar) e o quão fácil é reverter se der errado.

### Tabela-resumo, da mais segura pra mais arriscada

| #   | Ação                                                     | Risco                 | Reversível?                                                             | Precisa de deploy/migration?                       | Status                    |
| --- | -------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- | ------------------------- |
| A   | RLS: `(select auth.<função>())` nas 19 policies          | 🟢 Baixo              | Sim, imediato (re-executar `CREATE POLICY` antigo)                      | Migration SQL simples                              | ✅ **FEITO (2026-09-05)** |
| B   | RLS: consolidar 67 policies duplicadas                   | 🟡 Baixo-médio        | Sim, mas exige atenção                                                  | Migration SQL, requer teste de acesso por role     | ⏳ Pendente               |
| C   | Espaçar `processa-fila-email` de 1 min → 2–5 min         | 🟢 Baixo              | Sim, imediato (`cron.alter_job`)                                        | Migration SQL simples                              | ✅ **FEITO (2026-09-05)** |
| D   | Chamado no suporte Supabase sobre `pg_net`               | ⚪ Nenhum             | N/A                                                                     | Nenhuma (não mexe em nada nosso)                   | ⏳ Pendente               |
| E   | Desabilitar Realtime em tabelas de baixíssimo uso        | 🟡 Médio              | Sim, mas quebra silenciosamente até perceber                            | Migration SQL (`ALTER PUBLICATION ... DROP TABLE`) | ⏳ Pendente               |
| F   | Mexer no reconnect de `usePresence`/`useTypingIndicator` | 🔴 Alto               | Sim (reverter o código), mas o bug que motivou o workaround pode voltar | Deploy de frontend                                 | ⏸️ Não fazer agora        |
| G   | Upgrade de compute                                       | 🟢 Baixo (só custo $) | Sim, é só plano/billing                                                 | Nenhuma, é dashboard                               | ⏳ Pendente               |

### Detalhe por item

**A. RLS — `auth.<função>()` → `(select auth.<função>())`** — 🟢 **Risco baixo** — ✅ **FEITO (2026-09-05)**

- O que pode dar errado: praticamente nada — é reescrever a mesma condição lógica de forma
  otimizada (o Postgres já recomenda esse padrão nos docs oficiais). Não muda **quem** tem
  acesso, só **como** a condição é avaliada (uma vez por query, não por linha).
- Cenário de erro possível: erro de digitação na regra reescrita mudando a condição por acidente
  (ex.: trocar `and` por `or` sem querer). Mitigado testando a policy reescrita com um usuário de
  cada papel antes de aplicar em todas.
- Como aplicar com segurança: uma tabela por vez, rodar a policy nova, testar leitura/escrita com
  um usuário real (ou `set role`) daquela tabela, só then seguir pra próxima.
- Rollback: reaplicar a definição antiga da policy (guardar o `pg_policies.qual`/`with_check`
  original antes de alterar).

**Execução (2026-09-05):** o levantamento via `pg_policies` encontrou **25 policies** (não 19 —
o advisor aparentemente não conta as do schema `storage` da mesma forma). Aplicadas em 5 lotes,
um `ALTER POLICY` por vez reaproveitando o texto exato da condição original (só envolvendo
`auth.uid()`/`auth.jwt()` em `(select ...)`), validando com uma query de detecção após cada lote:

- Lote 1 — `gestao_ativos` (5 policies): `logs_auditoria_select_admin_central`,
  `permissoes_central_select_admin_gestor`, `permissoes_central_write_admin`,
  `permissoes_central_nivel_select`, `permissoes_central_nivel_write`.
- Lote 2 — `gestao_intranet` (5 policies): `intranet_google_calendar_manage_self`,
  `intranet_google_calendar_select_self`, `intranet_google_oauth_state_manage_self`,
  `intranet_notificacoes_select_self`, `intranet_notificacoes_update_self`.
- Lote 3 — `gestao_plataforma` (3 policies): `alertas_seguranca_enviados_select_admin_console`,
  `logs_acesso_plataforma_select_admin_console`, `logs_auditoria_plataforma_select_admin_console`.
- Lote 4 — `gestao_relatorio` (5 policies): `avisos_relatorios_select_admin_or_permitted`,
  `avisos_relatorios_aceites_insert_own`, `avisos_relatorios_aceites_select_admin_or_own`,
  `permissoes_funcoes_select_admin_relatorios`, `permissoes_funcoes_write_admin`
  (`relatorios_is_admin()` não foi alterada — é função à parte).
- Lote 5 — `public` + `storage` (7 policies): `acessos_read_self_or_admin`
  (`is_intranet_admin()` não foi alterada), e as 6 policies de `storage.objects` dos buckets
  `assinaturas`/`avatares` (`storage_assinaturas_*`, `storage_avatars_*`).

Verificação final: query em todos os schemas do banco confirma **0 policies** ainda chamando
`auth.uid()`/`auth.jwt()`/`auth.role()` direto — `auth_rls_initplan` zerado. Migrations gravadas
em `supabase/migrations/20260905150000` a `20260905150400` e marcadas como aplicadas no controle
de migrations do Supabase (`supabase migration repair --status applied`), já que foram executadas
via `db query --linked` e não via `migration up`/`db push`.

**B. RLS — consolidar policies duplicadas** — 🟡 **Risco baixo-médio**

- O que pode dar errado: se a fusão das condições com `OR` for feita errado, pode **abrir acesso
  a mais gente do que devia** (falso liberado) ou **bloquear quem tinha acesso antes** (falso
  negado) — é o item de RLS mais sensível dos dois, porque mexe na lógica de várias policies ao
  mesmo tempo, não só na forma de uma.
- Mitigação: fazer tabela por tabela, escrever a policy consolidada, testar explicitamente os
  casos de borda (usuário comum vs. admin vs. dono do registro) antes de aplicar a próxima.
- Rollback: mesma lógica do item A — guardar definição original de cada policy antes de mexer.

**Levantamento (2026-09-05):** advisor `multiple_permissive_policies` retornou 67 achados brutos,
mas isso conta o mesmo par de policies uma vez por `role` do Postgres (`anon`, `authenticated`,
`authenticator`, `cli_login_postgres`, `dashboard_user`, `supabase_privileged_role`). Deduplicando
por tabela+ação, são **37 pares/trios de policies permissivas duplicadas de fato**. Puxei a
definição completa (`qual`/`with_check`) de cada uma via `pg_policies` para classificar:

*Tier 1 — condição idêntica, drop direto e seguro (7 casos):* a policy `_manage` (`FOR ALL`) e a
`_select` (`FOR SELECT`) têm exatamente a mesma condição — a segunda é 100% redundante, a primeira
já cobre leitura. Basta `DROP POLICY` na `_select`, sem risco de mudar quem acessa o quê:
`gestao_crm.atendimentos`, `gestao_crm.conversas_atendimento`, `gestao_crm.historico_atendimentos`,
`gestao_crm.leads`, `gestao_crm.mensagens_atendimento`, `gestao_crm.veiculos_interesse`,
`gestao_intranet.integracoes_google_calendar`. ✅ **FEITO (2026-09-05)** — migration
`20260905150500_drop_redundant_select_policies_tier1.sql`, com o texto original de cada policy
comentado no topo do arquivo para rollback. Aplicada via `db query --linked` e verificada:
sobrou exatamente 1 policy (`_manage`, `FOR ALL`) em cada uma das 7 tabelas.

*Tier 2 — padrão "editar implica ver" (23 casos):* a policy `_manage`/`_write` (`FOR ALL`) usa uma
condição mais restrita (ex.: `can_edit_module`, `funcao = 'admin'`) e a `_select` usa uma condição
mais ampla que já inclui esse caso via `OR` (ex.: `can_view_module`, ou o mesmo admin-check
repetido dentro de um `OR`). Ex.: `gestao_intranet.avisos`, `gestao_intranet.documentos`,
`gestao_intranet.eventos_calendario`, `gestao_intranet.base_conhecimento`,
`gestao_intranet.links_uteis`, `gestao_intranet.perfis_colaboradores`,
`gestao_intranet.permissoes_usuario`, `gestao_intranet.eventos_calendario_participantes`,
`gestao_ativos.contratos_documentos`, `gestao_ativos.permissoes_central`,
`gestao_ativos.permissoes_central_nivel`, `gestao_comunicacao.canais`,
`gestao_crm.categorias_veiculo`, `gestao_crm.configuracoes_distribuicao`,
`gestao_crm.vendedores_distribuicao`, `gestao_relatorio.avisos_relatorios` (+`_aceites` x2),
`gestao_relatorio.permissoes_funcoes`, `gestao_relatorio.permissoes_relatorios`,
`gestao_relatorio.relatorios`, `gestao_relatorio.relatorios_unidades`.

  - **Lote 1 — `gestao_intranet` (8 tabelas)** ✅ **FEITO (2026-09-06)**: `avisos`,
    `base_conhecimento`, `documentos`, `eventos_calendario`,
    `eventos_calendario_participantes`, `links_uteis`, `perfis_colaboradores`,
    `permissoes_usuario`. Migration `20260906120000_narrow_manage_policies_tier2_lote1_intranet.sql`.
    Verificado antes de aplicar, lendo o código-fonte de `intranet_can_edit_module`,
    `intranet_can_view_module`, `intranet_is_admin`, `intranet_has_access` e
    `intranet_module_permission`: `can_edit_module(X)` sempre implica `can_view_module(X)`
    para os módulos usados (admin sempre vê, e quem tem permissão `'edit'` nunca tem
    `module_permission = 'none'`) — não existe caso de "edita mas não vê". Cada `_manage`
    (`FOR ALL`) virou 3 policies (`_manage_insert`/`_manage_update`/`_manage_delete`), já que
    `CREATE POLICY` não aceita múltiplos comandos numa só declaração (diferente de `GRANT`);
    mesma condição (`qual`/`with_check`) preservada, só o comando mudou. `_select` de cada
    tabela não foi tocada. Verificado via `pg_policies`: cada tabela ficou com 4 policies (1
    por comando). Rollback documentado no comentário da migration.

  - **Lote 2 — `gestao_ativos` + `gestao_comunicacao` + `gestao_crm` (7 tabelas)** ✅ **FEITO
    (2026-09-06)**: `gestao_ativos.contratos_documentos`, `gestao_ativos.permissoes_central`,
    `gestao_ativos.permissoes_central_nivel`, `gestao_comunicacao.canais`,
    `gestao_crm.categorias_veiculo`, `gestao_crm.configuracoes_distribuicao`,
    `gestao_crm.vendedores_distribuicao`. Migration
    `20260906130000_narrow_manage_policies_tier2_lote2.sql`. Verificado antes de aplicar, lendo
    `pg_get_functiondef` de `central_module_access`, `comunicacao_is_admin`,
    `comunicacao_has_access`, `crm_access_level`, `crm_has_access`, e o SQL inline de
    `permissoes_central`/`permissoes_central_nivel`: em todos os 7 casos, a condição de
    `_manage`/`_write` é subconjunto estrito da condição de `_select` (ex.: `gerenciar` está
    dentro do conjunto aceito por `ver`; admin está dentro do conjunto de quem tem acesso; o
    branch "gestor" de manage já satisfaz a condição não-admin de select) — não existe caso de
    "edita mas não vê". Mesmo padrão do Lote 1: cada `_manage`/`_write` (`FOR ALL`) virou 3
    policies (`_insert`/`_update`/`_delete`) com a mesma condição; `_select` não foi tocada.
    `contratos_documentos` manteve roles `{public}` (igual original); as outras 6 mantiveram
    `{authenticated}`. Verificado via `pg_policies`: cada tabela ficou com 4 policies (1 por
    comando), roles corretos. Rollback documentado no comentário da migration.

Nestes, dropar a `_select`
mudaria comportamento (ela é mais permissiva que a `_manage`) — o fix correto é o oposto: reduzir
o escopo da `_manage` de `FOR ALL` para só `INSERT, UPDATE, DELETE` (via `DROP` + `CREATE POLICY`,
já que `ALTER POLICY` não muda o comando), deixando a `_select` como única dona do `SELECT`. Exige
confirmar, por tabela, que a função de "editar" realmente implica a de "ver" (senão um usuário que
só edita mas não deveria ver perderia acesso de leitura ao consolidar).

*Tier 3 — casos especiais, lógica genuinamente distinta (7 casos), tratar um a um:*
- `gestao_intranet.comentarios_avisos` (INSERT e SELECT): 3 policies com regras diferentes
  (`_insert` exige `can_view_module` + autor; `_update_delete` é `FOR ALL` admin-ou-autor;
  `_select` é só `can_view_module`). Fusão requer `OR` cuidadoso, não é drop simples.
- `gestao_servicos.parcelas_pagamento` (INSERT e SELECT) e `gestao_servicos.solicitacoes_pagamento`
  (UPDATE): regras de negócio financeiro (financeiro vs. pagador vs. solicitante vs. aprovador)
  genuinamente diferentes entre as policies duplicadas — precisa entender o fluxo de aprovação do
  módulo Financeiro antes de fundir.
- `public.sistemas` (SELECT): `sistemas_read_authenticated` e `sistemas_select_authenticated` são
  **duplicata exata** (`qual: true` nas duas) — resíduo de migração, sem risco (tabela já é
  catálogo público pra todo autenticado). Drop de uma das duas. — ✅ **FEITO (2026-09-05)**, migração
  `20260905151500_drop_duplicate_select_policy_sistemas.sql` (removida `sistemas_select_authenticated`,
  mantida `sistemas_read_authenticated`; verificado via `pg_policies` que só restaram
  `sistemas_admin_manage` e `sistemas_read_authenticated`).
- `public.acessos_usuario_sistema` (SELECT) — **achado de segurança, não só performance**: além de
  `acessos_admin_manage` (admin) e `acessos_read_self_or_admin` (dono do registro ou admin), existe
  `acessos_usuario_sistema_select_authenticated` com `qual: true` — libera leitura da tabela
  **inteira** (quem tem acesso admin/gestor a qual sistema) para qualquer usuário autenticado de
  qualquer app, anulando a restrição self-or-admin. Investigado o frontend: nenhuma tela consome
  essa tabela via client Supabase direto — `CatalogManager.jsx` (central) e `reportsSystemAccessApi.js`
  (relatorios) passam pela Edge Function (`central-api`/`relatorios-api`, service role, ignora RLS),
  então a policy `true` está sem uso real hoje, é resquício. Recomendação: `DROP POLICY
  acessos_usuario_sistema_select_authenticated` — reduz superfície de exposição sem quebrar nada
  (nenhum consumidor depende dela). — ✅ **FEITO (2026-09-05)**, migração
  `20260905153000_drop_unused_select_policy_acessos_usuario_sistema.sql` (removida
  `acessos_usuario_sistema_select_authenticated`; verificado via `pg_policies` que só restaram
  `acessos_admin_manage` e `acessos_read_self_or_admin`). Rollback documentado no comentário da
  migração caso algum consumidor não mapeado apareça.

**Ordem de execução sugerida dentro do item B:** Tier 1 (drop simples, 7) → `sistemas` (drop
duplicata exata) → `acessos_usuario_sistema` (drop policy sem uso, achado de segurança) → Tier 2
(23, requer `DROP`+`CREATE` por tabela, o maior volume) → Tier 3 restante (comentarios_avisos,
parcelas_pagamento, solicitacoes_pagamento — requer entender regra de negócio antes de mexer).

**C. Espaçar `processa-fila-email` de 1 min para 2–5 min** — 🟢 **Risco baixo** — ✅ **FEITO (2026-09-05)**

Aplicado em dois passos: `1min → 2min` e depois `2min → 5min`, ambos via `select
cron.alter_job(13, schedule => '...')`, confirmado em `cron.job` (jobid 13, schedule final
`*/5 * * * *`, `active = true`). Reduz em ~80% as chamadas de `net.http_post`/limpeza do `pg_net`
geradas por este job (de 1.440 execuções/dia para 288). Se precisar reverter:
`select cron.alter_job(13, schedule => '* * * * *');`.

**Quem hoje realmente dispara e-mail via essa fila** (levantado em 2026-09-05; correção em
2026-09-05: o levantamento inicial só buscou o helper `enqueueEmail`, e faltou uma fonte que
insere direto via SQL cru):

- `intranet-notifica-aniversariante` (cron diário, 8h) — **gerador ativo**. Atraso de até 5 min é
  irrelevante para um aviso que já roda 1x/dia.
- `security-alerta-picos-login` (cron a cada 15 min — é o "aviso de tentativa de login" notado
  pelo usuário) — **gerador ativo**. Detecta picos de login falho em
  `gestao_plataforma.logs_acesso` (≥8 tentativas/IP ou ≥5/conta em 15 min, cooldown de 60 min por
  chave) e insere direto em `notificacoes.fila_emails` via SQL cru (não usa `enqueueEmail`, por
  isso não apareceu no grep inicial). Atraso de até 5 min é aceitável — é alerta informativo pro
  admin, não bloqueio de acesso (o bloqueio de força bruta em si é outro mecanismo, síncrono, ver
  `security-log-failed-login` / `SECURITY_AUDIT.md`).
- `servicos-api` (aprovação/reprovação de solicitação, abertura/liberação de pendência) — código
  existe, mas está **desativado** pela flag `EMAIL_NOTIFICATIONS_ENABLED = false`
  (`servicos-api/index.ts:714`, desde 2026-09-02, aguardando revalidação da credencial Gmail —
  ver `EMAIL_NOTIFICACOES_STATUS.md`). O aviso in-app/push desses eventos continua funcionando
  normalmente; só o e-mail está suspenso. Quando for reativado, o atraso máximo passa a ser 5 min
  — aceitável, já que é notificação assíncrona, não confirmação com janela curta de validade.
- Termo de Posse (`enviar-termo-gmail`) é **síncrono e não passa por esta fila/cron** — não afetado
  pela mudança de intervalo.

Acompanhar por 1–2 dias se `notificacoes.fila_emails` continua drenando normalmente (sem acúmulo
em `pendente`/`erro`).

- O que pode dar errado: e-mails saem com alguns minutos de atraso a mais (hoje já é assíncrono,
  via fila — ninguém espera resposta síncrona). Não afeta o Termo de Posse, que é a única rota
  síncrona e não passa por este cron.
- Cenário de erro possível: nenhum realista — é trocar o `schedule` de um job já existente, não
  toca no código da function nem na fila.
- Como aplicar com segurança: `select cron.alter_job(13, schedule => '*/2 * * * *');` (ajustar
  jobid/intervalo), depois observar por 1–2 dias se a fila `notificacoes.fila_emails` não está
  acumulando (deveria continuar drenando normalmente, só com lotes um pouco mais espaçados).
- Rollback: `select cron.alter_job(13, schedule => '* * * * *');` — instantâneo, sem migration de
  schema, sem downtime.

**D. Chamado com o suporte Supabase sobre custo do `pg_net`** — ⚪ **Sem risco**

- Não mexe em nada do nosso lado. Só reporta o achado. Pode ser feito a qualquer momento.

**E. Desabilitar Realtime em tabelas de baixo uso** — 🟡 **Risco médio**

- O que pode dar errado: se alguma tela em produção depender de um `postgres_changes` numa
  dessas tabelas (mesmo que hoje tenha poucas linhas, pode ter _listener_ já plugado em algum
  componente que a gente não olhou), a UI para de atualizar em tempo real **sem lançar erro
  nenhum** — é o tipo de quebra silenciosa mais chata de detectar, porque não aparece em log,
  só o usuário reclamando que "não atualiza sozinho".
- Mitigação: antes de tirar uma tabela da publicação, `grep` por ela nos hooks de Realtime de
  cada app (`useCrmRealtime.js`, `useIntranetRealtime.js`, etc.) e confirmar que nenhum listener
  ativo depende dela. Tirar uma tabela por vez, não em lote.
- Rollback: `ALTER PUBLICATION supabase_realtime ADD TABLE <schema>.<tabela>;` — reversível na
  hora, mas o cliente frontend só volta a receber eventos depois de reconectar o canal (refresh
  da página resolve).
- **Ganho é menor do que parece**: como já registrado na análise, isso reduz o volume filtrado
  pós-decodificação, mas não reduz o volume de WAL decodificado pelo Realtime (que é por
  transação do banco inteiro). Por isso este item tem prioridade mais baixa apesar de "parecer"
  a correção óbvia.

**F. Mexer no reconnect de `usePresence`/`useTypingIndicator`** — 🔴 **Risco alto — não recomendo
mexer agora**

- O código já documenta que existe um bug conhecido do lado do servidor Realtime (canal de
  presence fecha por idle timeout e não re-adere sozinho) e que esse reconnect manual foi a
  correção validada para isso. Reduzir/remover essa lógica sem entender por que o servidor fecha
  o canal tão frequentemente arrisca **trazer de volta o bug original**: presence/typing
  indicator do chat parando de funcionar silenciosamente até o usuário dar F5.
- Se for necessário mexer, a única mudança de baixo risco é aumentar o delay do
  `setTimeout` de reconexão (hoje 500ms) para espaçar as tentativas — mas isso só reduz o _pico_
  de escritas em rajada, não o volume total, e exige teste manual do presence/typing no chat
  antes de subir pra produção.
- **Recomendação:** deixar este item parado até confirmar (via logs do Realtime ou suporte
  Supabase) a causa do fechamento frequente do canal — mexer no sintoma sem entender a causa é
  o cenário com mais chance de reabrir um bug já corrigido.

**G. Upgrade de compute** — 🟢 **Risco baixo (é só orçamento)**

- Não quebra nada, é reversível a qualquer momento pelo dashboard. O único "risco" é custo
  recorrente maior. Serve como paliativo enquanto os itens acima são avaliados, não como
  correção da causa raiz.

## Ordem recomendada de execução (mais seguro → mais arriscado)

1. **D** — abrir o chamado com o suporte (zero risco, pode ser feito hoje).
2. **A** — corrigir as 19 policies de RLS, uma tabela por vez, com teste de acesso.
3. ~~**C** — espaçar o `processa-fila-email` para 2–5 min~~ ✅ **FEITO (2026-09-05)** — schedule
   alterado de `* * * * *` para `*/5 * * * *`; observar a fila por 1–2 dias antes de seguir.
4. **B** — consolidar as 67 policies duplicadas, tabela por tabela, com teste de casos de borda.
5. **E** — avaliar remoção de tabelas do Realtime, só depois de confirmar (via grep no código)
   que nenhum listener ativo depende delas.
6. **G** — upgrade de compute, só se o alerta persistir depois dos itens acima.
7. **F** — não fazer agora; retomar só com mais dados sobre por que o servidor fecha o canal de
   presence com tanta frequência.

## Próximos passos em aberto

- Revisar `apps/servicos/src/components/layout/NotificationsBell.jsx`,
  `apps/intranet/src/lib/useIntranetRealtime.js` e `apps/intranet/src/components/layout/Header.jsx`
  para confirmar se algum deles também reconecta manualmente contribuindo para o churn de
  `realtime.subscription`.
- Decidir com o usuário se `processa-fila-email` pode rodar em intervalo maior que 1 minuto.
- Decidir se vale abrir chamado com o suporte Supabase sobre o custo de limpeza do `pg_net`.
