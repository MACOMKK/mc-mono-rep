# Servicos — app-specific

> Este arquivo complementa o CLAUDE.md raiz do monorepo. Só documenta o que é específico deste app.

## Domínio

Sistema multi-módulo para operação de oficina/concessionária. Módulos planejados:
**Atendimento** (recepção, OS, agendamento, histórico de veículos), **Oficina** (serviços
executados, mecânicos, checklist, controle de peças), **Financeiro** (solicitação de pagamento,
contas a pagar/receber, comissões, fluxo de caixa), **Estoque** (peças, pneus, óleos, entradas e
saídas), **Compras** (solicitação, aprovação, pedido a fornecedores) e **RH** (funcionários,
férias, reembolsos — aqui restrito ao operacional da oficina; RH corporativo completo é escopo do
app `rh`, ver Convenções).

Isso substitui a decisão antiga (registrada aqui antes da migração) de que "serviços"/"portaria"
deveriam virar módulos da `intranet` — com 6 domínios operacionais distintos e volume de tela
previsto, um app próprio com arquitetura multi-módulo é o caminho certo.

Hoje só o módulo **Financeiro** está implementado — é o antigo app `pagamentos`, migrado sem
mudanças funcionais. Os demais aparecem no menu como "em breve" (`src/lib/navigation.js`,
`comingSoon: true`) sem backend ainda.

## Financeiro — solicitações e fluxo de aprovação de pagamentos

Colaborador solicita, um aprovador decide (aprovado/reprovado), o financeiro marca como pago.
Máquina de estados: `pendente → aprovado | reprovado`, e `aprovado → pago`.

### Papéis (Camada 1 + Camada 2 por módulo)

Duas camadas, mesmo padrão que a intranet usa (`gestao_intranet.permissoes_usuario` +
`canViewModule`), adaptado pra papéis de aprovação em vez de `view/edit`:

- **Camada 1 — acesso ao sistema**: `public.acessos_usuario_sistema.nivel_acesso` (sistema
  `servicos`), concedida na console `admin` (`SystemAccessManagement.jsx`). Responde só "essa
  pessoa pode entrar no Servicos?". `nivel_acesso = 'admin'` bypassa a Camada 2 em todo módulo
  (super-admin do sistema).
- **Camada 2 — papel por módulo**: `gestao_servicos.permissoes_modulo` — tabela normalizada
  (`colaborador_id, modulo, papel`, unique por par), gerenciada dentro do próprio app em
  `/permissoes` (`src/pages/Permissoes.jsx`, visível só pra quem é `admin` na Camada 1). Modelo
  normalizado (não uma coluna `mod_<modulo>` por módulo, como na primeira versão em
  `20260805120000_add_gestao_servicos_permissoes_usuario.sql`) justamente pra módulo novo não
  exigir migration — só inserir linhas com o `modulo` novo. Migration de normalização:
  `20260805130000_normalize_gestao_servicos_permissoes_usuario.sql`.
  - Os valores válidos de `papel` **não são um enum global único** — cada módulo declara seu
    próprio conjunto, porque nem todo módulo futuro vai precisar da mesma hierarquia de
    aprovação do Financeiro. Hoje só o Financeiro existe: `usuario | aprovador | financeiro |
    nenhum` — nomes específicos do domínio (não os genéricos `gestor`/`admin` da Camada 1),
    renomeados na migration `20260806100000_rename_servicos_financeiro_papeis.sql` (antes disso
    o módulo usava `gestor`/`admin`, o que gerava confusão com o `nivel_acesso` da Camada 1 e já
    não batia com o nome das funções SQL `servicos_is_aprovador`/`servicos_is_financeiro`, que
    desde sempre se chamavam assim). Auto-provisionado com `usuario` quando alguém ganha Camada
    1, via trigger `auto_create_servicos_permissoes`, pra ninguém ficar sem papel. Registro em dois lugares
    que precisam ficar em sincronia: `SERVICOS_MODULOS_CONFIG` (backend,
    `supabase/functions/servicos-api/index.ts`, valida `papel` por módulo em `set_permissao`) e
    `MODULOS_PERMISSAO` (frontend, `src/lib/modulosPermissao.js`, cada entrada ativa tem seu
    array `papeis`, controla o Select da tela de Permissões). Módulo novo com o mesmo tipo de
    hierarquia = só adicionar a chave nos dois lugares reaproveitando o array de papéis
    existente. Módulo novo com papéis diferentes = adicionar a chave com seu próprio array nos
    dois lugares e alargar o `check` de `gestao_servicos.permissoes_modulo.papel` via migration
    (o `CHECK` no banco é defesa em profundidade — a validação por módulo já acontece na edge
    function, mas o `CHECK` evita que alguém com acesso direto à tabela grave um papel fora do
    conjunto conhecido).

| Papel no módulo Financeiro | Pode |
|---|---|
| `usuario` | Criar solicitações, editar/ver as próprias enquanto `pendente` |
| `aprovador` | Ver e aprovar/reprovar só as solicitações endereçadas a ele (`aprovador_destino_id`), além das próprias como solicitante |
| `financeiro` | Ve/acessa todas as solicitações (não só as endereçadas a ele) + tudo do aprovador + marcar `aprovado` como `pago` |
| `nenhum` | Sem acesso ao módulo (mas continua com Camada 1 ativa, pra outros módulos) |

**Solicitação em dinheiro tem visibilidade restrita** (migration
`20260825150000_add_servicos_dinheiro_visibilidade_restrita.sql`): com
`forma_pagamento = 'dinheiro'`, só o solicitante, o aprovador destino (na etapa de aprovação) e o
papel `financeiro` (na etapa de pagamento) veem a solicitação — `contas_a_pagar` fica de fora
(mesmo tendo acesso amplo às demais formas de pagamento via `isPagador`), e a regra de "mesmo
setor" (ver abaixo) não amplia a visibilidade nesse caso. Configurável (liga/desliga) via
`gestao_servicos.configuracoes_modulo.restringir_visibilidade_pagamento_dinheiro` (linha única,
default `true`, fail-safe `true` se a linha não existir) — não existe mecanismo de
configuração/feature-flag genérico no sistema, essa tabela foi criada só pra esse caso, mas
desenhada pra reaproveitar (próximo flag do módulo vira só mais uma coluna na mesma linha). Toggle
exposto em `/configuracoes` (aba "Financeiro", só pra quem é `isFinanceiro`). Aplicado em 3
camadas: `canAccessSolicitacao`/`canViewAnexoSigiloso` (edge function, agora `async` porque leem o
flag via `getRestringeVisibilidadeDinheiro`, cacheado 30s), a query de `list` (constrói o `WHERE`
manualmente, não reaproveita RLS — precisa da mesma regra duplicada em SQL), e
`public.servicos_can_access_solicitacao`/policy `servicos_parcelas_write_financeiro` (RLS, defesa
em profundidade). As ações `marcar_pendencia`/`criar_parcelas`/`registrar_pagamento_parcela`
continuam usando `isPagador` sem checagem extra — ficam protegidas automaticamente porque chamam
`ensureRowAccess`/`ensureParcelaAccess` internamente.

**Aprovador é por solicitação, não por papel** (migration
`20260806110000_scope_servicos_aprovador_destino.sql`): toda solicitação tem um
`aprovador_destino_id` obrigatório, escolhido pelo solicitante na criação (select "Aprovador
responsável" em `NovaSolicitacaoDrawer.jsx`, populado pela action `list_aprovadores` — lista
colaboradores com papel `aprovador`/`financeiro` no Financeiro, ou `nivel_acesso = 'admin'` na
Camada 1). Um `aprovador` só vê/acessa/decide sobre a solicitação que foi endereçada a ele — não
qualquer solicitação `pendente` de qualquer colaborador. `financeiro` continua vendo e podendo
agir sobre todas, como sobreposição (é o papel "acima" do fluxo). Essa checagem é centralizada em
`canAccessSolicitacao()` (edge function) e na função SQL
`public.servicos_can_access_solicitacao()` (RLS, defesa em profundidade).

O papel efetivo (Camada 1 admin bypassando, senão lido da Camada 2) é calculado em
`getServicosModuleRole` (`supabase/functions/servicos-api/index.ts`) e nos helpers SQL
`servicos_module_role`/`servicos_is_aprovador`/`servicos_is_financeiro` (usados nas RLS policies).
O front consome esse valor direto (sem remapeamento) em `src/lib/AuthContext.jsx`
(`normalizeServicosUser`), a partir do campo `role` retornado por `financeiroApi.auth.me`.

Um colaborador só precisa aparecer na Camada 2 nos módulos que usa — alguém pode ser `aprovador` no
Financeiro sem ter nenhum papel definido em Oficina/Estoque quando esses módulos ganharem telas
reais (só adicionar coluna `mod_<novo>` na tabela, seguindo o mesmo padrão).

### Backend

- Edge Function: `supabase/functions/servicos-api/index.ts` (renomeada de `pagamentos-api`)
  - Entidade principal: `solicitacoes_pagamento`. Ações: `me`, `list`, `get`, `create`, `update`
    (só solicitante, só enquanto `pendente`; `create`/`update` exigem `aprovador_destino_id`
    válido, validado em `validateAprovadorDestino()`), `set_status` (transição de estado, valida
    papel + estado atual + se é o `aprovador_destino_id` da solicitação ou financeiro),
    `signed_url` (URL assinada do comprovante), `list_empresas` (catálogo `public.empresas` pro
    seletor da tela de nova solicitação — a tabela **não tem** coluna `ativo`/`slug`, foram
    dropadas em `20260709120000_simplify_empresas_link_unidades.sql`; lista todas as linhas, sem
    filtro), `list_aprovadores` (colaboradores elegíveis a `aprovador_destino_id` — papel
    `aprovador`/`financeiro` no módulo ou `nivel_acesso = 'admin'` na Camada 1; usada pelo select
    de nova solicitação, disponível pra qualquer usuário com acesso ao módulo, não só admin).
  - Anexos multi-arquivo: `list_anexos`, `registrar_anexo`, `remover_anexo` (tabela
    `anexos_solicitacao`, categorias `comprovante_solicitacao | nf_boleto | pdf_unificado | rh |
    comprovante_pagamento`; upload é feito direto do client pro Storage, a function só registra
    metadados e gera signed URL).
  - Parcelamento: `list_parcelas`, `criar_parcelas` (só financeiro, solicitação precisa estar
    `aprovado`; substitui o plano de parcelas existente se nenhuma ainda foi paga),
    `registrar_pagamento_parcela` (só financeiro, marca uma parcela como `pago` — quando a
    última parcela de uma solicitação é paga, o trigger `trg_servicos_parcelas_rollup` marca a
    própria solicitação como `pago` automaticamente).
  - Histórico: ação `historico` lê `historico_solicitacao` (timeline de eventos: `criada`,
    `aprovada`, `reprovada`, `parcela_criada`, `parcela_paga`, `pago`) — gravado pela própria
    function via `insertHistorico()` a cada transição, sem precisar de trigger.
  - Fornecedores (`gestao_servicos.fornecedores`): cadastro exclusivo do papel `financeiro`
    (checado via `isFinanceiro(moduleRole)`, que já cobre admin da Camada 1 — `getServicosModuleRole`
    retorna `'financeiro'` pra admin). Tela dedicada `/fornecedores` (`src/pages/Fornecedores.jsx`,
    só no menu pra `isFinanceiro`), ações `list_fornecedores_admin` (todos, com `ativo`),
    `criar_fornecedor` e `atualizar_fornecedor`. `list_fornecedores`
    (usada no select do `NovaSolicitacaoDrawer.jsx`, disponível a qualquer solicitante) só retorna
    `ativo = true`. Fornecedor é inativado, nunca apagado — `solicitacoes_pagamento.fornecedor_id`
    referencia a linha e `fornecedor` já é snapshot do nome, então inativar não quebra histórico.
    Antes disso o cadastro era feito inline no próprio drawer por qualquer solicitante
    (`criar_fornecedor` sem checagem de papel); migrado pra tela própria em
    `20260806120000_add_servicos_fornecedores_gestao.sql` (colunas `ativo`/`atualizado_em`).
    Cadastro expandido em `20260824140000_expand_servicos_fornecedores.sql` com campos fiscais
    (`tipo_pessoa`, `documento` — único quando preenchido, `inscricao_estadual`), contato
    (`email`, `telefone`) e endereço (`endereco`, `cidade`, `uf`, `cep`) — todos nullable,
    normalizados em `extrairDadosFornecedor()` na edge function (documento sem pontuação, campos
    vazios viram `null`). Dados bancários (banco/agência/conta/PIX) ficaram fora de escopo —
    o Financeiro decidiu não guardar essa informação no cadastro de fornecedor. A tela trocou os
    inputs inline por um `Dialog` de cadastro/edição
    (`src/pages/Fornecedores.jsx`) com todos os campos; a tabela continua enxuta (nome,
    documento, status). `list_fornecedores` (catálogo do drawer de nova solicitação) não mudou —
    continua só `id, nome`.
  - Categorias (`gestao_servicos.categorias`): mesmo padrão de fornecedores (cadastro exclusivo
    do papel `financeiro`, tela dedicada `/categorias` — `src/pages/Categorias.jsx`, ações
    `list_categorias_admin`/`criar_categoria`/`atualizar_categoria`, `list_categorias` só ativas
    pro select do `NovaSolicitacaoDrawer.jsx`), substituindo o enum fixo antigo (`fornecedor |
    servico | viagem | reembolso | outros`, hardcoded em `CATEGORIAS` na function e no drawer).
    `solicitacoes_pagamento.categoria_id` referencia a linha; `categoria` (texto) continua como
    snapshot do nome no momento da solicitação, mesmo padrão de `fornecedor`/`fornecedor_id` —
    o antigo `CHECK` de enum na coluna foi removido (migration
    `20260806130000_add_servicos_categorias.sql`), já que o valor agora vem de um catálogo aberto,
    não mais uma lista fixa no código.
  - Toda a autorização é feita em código na função (não há motor genérico de entidades como em
    `intranet-api`/`crm-api` — este app tem uma entidade principal, não precisou do padrão
    `ENTITY_CONFIG`).
- Schema: `gestao_servicos` (renomeado de `gestao_pagamentos` na migration
  `20260720120000_rename_pagamentos_to_servicos.sql`; tabela original criada em
  `20260716090000_add_gestao_pagamentos_core.sql`)
  - Tabelas: `solicitacoes_pagamento` (ganhou `numero`, `titulo`, `empresa_id`,
    `departamento_id`, `observacao`, `aprovador_destino_id` na migration
    `20260805150000_add_servicos_financeiro_parcelamento_anexos.sql` — parte da migração do
    antigo fluxo em AppSheet; `aprovador_destino_id` só passou a ser exigido e aplicado em regra
    de acesso na migration `20260806110000_scope_servicos_aprovador_destino.sql`, ver seção
    "Papéis" acima), `anexos_solicitacao`, `parcelas_pagamento`,
    `historico_solicitacao` (todas novas na mesma migration `20260805150000`).
  - `empresa_id`/`departamento_id` são **snapshot no momento da criação** (copiados de
    `colaboradores.empresa_id`/`departamento_id` do solicitante na própria function, se não
    vierem no payload), não um join ao vivo — preserva o setor/empresa corretos historicamente
    mesmo que o colaborador mude de área depois.
  - `parcelas_pagamento`/`anexos_solicitacao`/`historico_solicitacao` seguem o padrão de tabela
    filha 1:N já usado em `gestao_comunicacao.anexos_mensagem`. "Tipo pagamento" (à vista/
    parcelado) e "status pagamento" (pendente/parcial/pago) **não são colunas** — são derivados
    agregando `parcelas_pagamento` na query da tela, pra não ter campo manual desincronizado.
  - Helpers SQL: `public.servicos_access_level()`, `public.servicos_has_access()`,
    `public.servicos_is_aprovador()`, `public.servicos_is_financeiro()`,
    `public.servicos_can_access_solicitacao(solicitante_id, aprovador_destino_id)` (esse último
    combina os dois: financeiro sempre pode, senão só o solicitante ou o aprovador designado da
    linha — usado nas policies de select/update de `solicitacoes_pagamento` e nas policies das
    tabelas filhas) — usados nas policies de RLS (defesa em profundidade; a função roda com
    `DATABASE_URL` direto e já valida em código).
  - Slug em `public.sistemas`: `servicos` (renomeado de `pagamentos` — o app nunca tinha ido para
    produção real, então o rename de slug/schema foi feito sem custo de migração de dados).
- Storage: bucket privado `comprovantes-pagamento` (5MB por arquivo, PDF/imagem — validado tanto
  em código quanto no próprio bucket via `allowed_mime_types`/`file_size_limit`). Upload é feito
  direto do client (`supabase.storage.from(financeiroApi.storage.bucket).upload(...)`), a
  function só registra o anexo e gera signed URL. Path organizado por
  `<solicitacao_id>/<categoria>/<uuid>.<ext>`.
- Notificação: ao aprovar/reprovar/pagar, a function insere em `gestao_ativos.fila_emails`
  (`tipo: 'aprovacao_pagamento'` ou `'pagamento_efetuado'`) — reaproveita a fila e o cron
  `processa-fila-email` já existentes, sem função nova.
- API client: `packages/api-client/src/financeiroApi.js` (renomeado de `pagamentosApi.js`,
  export `financeiroApi`), agora com os namespaces `anexos`, `parcelas`, `historico` e
  `empresas` além de `solicitacoes`/`permissoes`/`auth`.

### Convenções (Financeiro)

- Alçada de aprovação é única (um aprovador decide, e é sempre o mesmo indivíduo escolhido na
  criação — não "qualquer aprovador do módulo") — a antiga coluna "APROVADO GESTOR SETOR" da
  planilha AppSheet legada era redundante e não entrou no modelo novo; não há segunda etapa de
  aprovação (diretoria) nem regra por faixa de valor ainda. Se isso mudar (ex.: aprovação por
  faixa de valor, múltiplos aprovadores em paralelo), revisar a máquina de estados, o `set_status`
  da edge function e `servicos_can_access_solicitacao()`.
- Migração do AppSheet: o desenho completo (mapeamento das ~53 colunas da planilha legada pro
  modelo atual) está registrado em `20260805150000_add_servicos_financeiro_parcelamento_anexos.sql`
  e no histórico do plano que originou essa migration — importação de dados históricos do
  AppSheet continua fora de escopo.

## Oficina — Checklist de inspeção de veículos

Primeira funcionalidade real do módulo Oficina: checklist digital feito na entrada/saída do
veículo (itens de documentação/segurança/pneus, avarias marcadas num diagrama do veículo,
fotos, assinatura do cliente na entrega). Schema adaptado de um app standalone (Lovable,
"estrutura-banco-macom.sql") para reaproveitar entidades já centralizadas do monorepo em vez de
duplicar cadastro: `funcionario` (do app original) não existe aqui — quem faz o checklist é um
`public.colaboradores` normal; cliente e veículo são `public.clientes`/`public.veiculos` (as
mesmas tabelas usadas pelo CRM, extraídas propositalmente pra esse reuso — ver comentários em
`20260910130000_extract_public_veiculos.sql` e `20260915120000_extract_public_clientes.sql`).

- Tabelas (schema `gestao_servicos`): `checklist_avaliacoes` (registro principal — cliente_id,
  veiculo_id, colaborador_id, status `em_andamento|finalizado`), `checklist_avarias` (marcas de
  dano posicionadas em % sobre o diagrama do veículo) e `checklist_itens` (itens verificados por
  categoria). Migration `20260917020000_add_gestao_servicos_oficina_checklist.sql`.
- Papéis (Camada 2, módulo `oficina`): `usuario` (só lê), `inspetor` (realiza o checklist),
  `gestor` (gerencia o módulo), `nenhum` — sem hierarquia de aprovação como o Financeiro.
  Migration `20260917030000_add_servicos_oficina_papel.sql` (alarga o `CHECK` de
  `permissoes_modulo.papel` e estende `auto_create_servicos_permissoes` pra provisionar a linha
  `oficina` também).
- Assinatura do cliente é capturada ad hoc na tela, em dois momentos distintos (colunas
  `assinatura_entrada` e `assinatura_saida`, base64/data URL): a de entrada na etapa "Assinatura
  (Entrada)" do wizard (`ChecklistForm.jsx`, logo depois da inspeção/fotos), a de saída só na
  etapa final "Entrega e Saída", junto de `entrega_conferida`/`entrega_observacoes`, no momento de
  `checklist_finalizar` — evita reaproveitar a mesma assinatura para as duas declarações distintas
  impressas no documento (`ChecklistDocumento.jsx`, blocos ENTRADA/SAÍDA). Uma vez que
  `assinatura_entrada` existe, o wizard trava a volta às etapas anteriores (stepper e botão
  "Voltar" da etapa final ficam desabilitados) — o cliente já validou aquele estado do veículo, só
  a entrega/assinatura de saída ficam editáveis a partir daí. Assinatura do
  colaborador **não** é recapturada — lê-se `public.colaboradores.assinatura_url` (a mesma que a
  pessoa já cadastrou uma vez no Perfil da intranet).
- Fotos: bucket privado `oficina-checklist-fotos` (migration
  `20260917040000_add_servicos_oficina_checklist_fotos_storage.sql`), upload direto do client
  (RLS gated por `servicos_oficina_pode_editar()`), metadados guardados em `checklist_avaliacoes.fotos`
  (jsonb) via `checklist_foto_registrar`.

### Decisão de arquitetura: Oficina tem edge function própria (`servicos-oficina-api`)

Diferente do Financeiro (dentro de `servicos-api/index.ts`), as actions de Oficina vivem numa
function separada: `supabase/functions/servicos-oficina-api/index.ts`. Motivo: `servicos-api` já
tinha ~3600 linhas só de Financeiro e é deployada como uma unidade só — um erro de sintaxe ao
editar esse arquivo derrubaria a function inteira, inclusive o Financeiro (já em produção). Com
functions separadas, um bug em Oficina nunca afeta o deploy do Financeiro, e o arquivo de cada
módulo fica do tamanho do próprio domínio. **Este é o padrão a seguir para os próximos módulos
reais do `servicos`** (Estoque, Compras, RH, Atendimento): cada um ganha sua própria
`servicos-<modulo>-api`, em vez de crescer dentro de `servicos-api`.

**Dívida técnica registrada — auth duplicada entre `servicos-api` e `servicos-oficina-api`:** a
lógica de autenticação/autorização (`getAuthenticatedUser`, `getAuthContext`,
`getCurrentCollaborator`, `getServicosAccess`, `getServicosModuleRole`) foi **copiada** para
`supabase/functions/_shared/servicos-auth.ts` em vez de extraída de `servicos-api` — editar
`servicos-api/index.ts` na mesma entrega que criava Oficina arriscaria o deploy do Financeiro sem
necessidade. `servicos-api` continua com sua cópia local intacta. Isso deixa duas implementações
que podem divergir com o tempo. Migrar `servicos-api` para importar de `servicos-auth.ts`
(removendo a cópia local) fica para um follow-up separado, testado isoladamente com um smoke test
do Financeiro — mesmo padrão da dívida técnica de unificação de auth (`@macom/auth`) já registrada
no `CLAUDE.md` raiz. Nota: `servicos-auth.ts` já diverge da cópia de `servicos-api` num ponto —
o bypass de admin (Camada 1) retorna `'admin'` genérico, não o literal `'financeiro'` hardcoded
que só fazia sentido enquanto só existia um módulo — quem for migrar `servicos-api` precisa
ajustar `isFinanceiro`/`isPagador` lá para tratar `'admin'` também.

## Convenções (sistema Servicos)

- Novo módulo real ⇒ adicionar entrada em `src/lib/navigation.js` (tirar `comingSoon`), criar
  schema/tabelas próprias (pode reaproveitar `gestao_servicos` ou criar um schema novo se o
  domínio for muito distinto), registrar o módulo na Camada 2 de permissão (ver seção
  "Papéis" acima) com o conjunto de `papeis` que fizer sentido pro fluxo dele — não precisa
  reaproveitar a hierarquia de aprovação do Financeiro nem migrar pro padrão `view/edit` da
  intranet, o modelo atual já suporta um vocabulário de papéis por módulo — e criar sua própria
  edge function `servicos-<modulo>-api` (ver decisão de arquitetura na seção Oficina acima), não
  acrescentar dentro de `servicos-api`.
- Sobreposição com `apps/rh`: o módulo "RH" aqui é só operacional (reembolsos/férias da equipe
  da oficina); RH corporativo completo continua sendo escopo do app `rh` (hoje placeholder) —
  não duplicar funcionalidade quando `rh` sair do placeholder.

## Header — menu de conta (`AccountMenu`)

O dropdown de avatar/perfil no canto superior direito (`src/components/layout/Header.jsx`) usa o
componente `AccountMenu` de `@macom/ui` (`packages/ui/src/account-menu.jsx`), em vez de um
dropdown feito na mão — `servicos` foi o primeiro app a adotar esse padrão, pensado pra ser
reaproveitado pelos demais (a intranet, que hoje tem seu próprio dropdown em
`src/components/layout/Header.jsx`, deve migrar pra esse mesmo componente numa próxima rodada).

**Visual é fixo e vem da intranet, não do tema de cada app**: card escuro (`bg-[#242529]`),
vermelho da marca (`#E30613`) no avatar e nos destaques, tipografia uppercase/tracking largo —
copiado 1:1 do dropdown original da intranet e decidido como o padrão único pra todos os apps
(decisão do usuário: a base é a intranet, os demais é que se adaptam a ela, não o contrário).
`servicos` já está com essa cara agora, mesmo antes de ganhar as próprias telas de Perfil/senha.

`AccountMenu` é presentational (recebe `name`/`subtitle`/`photoUrl`/`onLogout` via props, sem
depender de `useAuth`/router de nenhum app) e aceita `children` pra itens extras — usar
`AccountMenuItem` (mesmo arquivo) pro estilo dos links ficar igual ao "Perfil"/"Configurações" da
intranet. Aqui em `servicos` não é passado nenhum `children` ainda, só `name`/`subtitle` (papel do
módulo Financeiro) e `onLogout`.

Foto **é** real (não só visual/estrutura): `foto_url`/`foto_path` viraram colunas de
`public.colaboradores` (migration `20260831113817_move_foto_colaborador_to_public.sql`), saindo de
`gestao_intranet.perfis_colaboradores` — foto é dado de identidade da pessoa (mesmo nível de
nome/e-mail), não algo exclusivo da intranet. Como `servicos-api`/`financeiroApi.auth.me` já fazem
`select * from public.colaboradores`, a coluna nova chega de graça no `collaborator`/`row`; só foi
preciso mapear `photoUrl: collaborator?.foto_url` em `normalizeServicosUser`
(`src/lib/AuthContext.jsx`) e passar `photoUrl={user?.photoUrl}` pro `AccountMenu` no `Header.jsx`.
Continua sem página "Perfil"/troca de senha nem upload próprio em `servicos` — quem edita a foto
por enquanto é só a tela de Perfil da `intranet`; aqui só se **lê** o que já foi cadastrado lá. Se
um dia `servicos` ganhar essas telas, plugar via `children`/`AccountMenuItem` em vez de reabrir o
dropdown manual.

## Assinatura digital no PDF único (módulo Financeiro)

Mesma lógica da foto: `assinatura_url`/`assinatura_path` são colunas de `public.colaboradores`
(migration `20260831120000_add_assinatura_colaborador.sql`), dado de identidade compartilhado —
criado desenhando num canvas na tela de Perfil da `intranet`, `servicos` só **lê**
(`signatureUrl: collaborator?.assinatura_url` em `normalizeServicosUser`,
`src/lib/AuthContext.jsx`). Não há tela de criar/editar assinatura em `servicos`.

Consumida em `SolicitacaoDrawer.jsx` → `handleGerarPdfUnico()` (o botão "Juntar PDFs" que já
existia pra concatenar os PDFs de anexo, client-side): se o usuário tem `user.signatureUrl` e
marca o checkbox "Incluir minha assinatura", abre `PositionSignatureModal` pra escolher página e
posição, e o carimbo final é feito com `embedSignatureImage`/`stampSignature`. O checkbox só
aparece pra quem já tem assinatura cadastrada. O PDF final continua só sendo baixado (não é
re-enviado como anexo automaticamente).

Toda a lógica de `pdf-lib`/`pdfjs-dist` (merge de PDFs, modal de posicionar assinatura, download,
preferência de posição por usuário) foi extraída para o pacote compartilhado
`packages/pdf-signature` (`@macom/pdf-signature`) — `servicos` foi o primeiro consumidor, mas o
pacote é genérico (recebe URL da assinatura e coordenadas fracionárias, não sabe nada de
Financeiro/solicitações) pra ser reaproveitado por outro fluxo de assinatura no futuro (ex.: termo
de recebimento de equipamento). `pdf-lib`/`pdfjs-dist` continuam declarados só em
`apps/servicos/package.json` (único app que os usa hoje) — funcionam pra qualquer pacote via
hoisting do npm workspaces, mesmo padrão que os demais pacotes `@macom/*` já seguem (não declaram
suas próprias deps de runtime).

## Assinatura de anexos individuais (substitui o arquivo, com histórico)

Distinto do "PDF único" acima: aqui cada **anexo PDF** pode ser assinado individualmente e o
arquivo original é **substituído** pela versão carimbada (não é só download). Só o `solicitante_id`
ou o `aprovador_destino_id` da solicitação podem assinar um anexo (`podeAssinarAnexo` em
`SolicitacaoDrawer.jsx`); botão "Assinar" some depois que o colaborador logado já assinou aquele
anexo (`anexoJaAssinadoPeloUsuario`).

Fluxo (`handleAbrirAssinaturaAnexo` → `PositionSignatureModal` com namespace de preferência
`'servicos-anexos'`, separado do `'servicos'` do PDF único → `handleConfirmarAssinaturaAnexo` →
`src/lib/anexoSignature.js#signAnexo`): baixa o PDF do anexo, carimba com
`embedSignatureImage`/`stampSignature` (`@macom/pdf-signature`), sobe o resultado pro Storage
(mesmo bucket/padrão de path de `anexoUpload.js`) e chama a ação `assinar_anexo` da `servicos-api`,
que atualiza `storage_path`/`nome_arquivo`/`tamanho_bytes` **na mesma linha** de
`anexos_solicitacao` (apaga o arquivo antigo do Storage), insere em
`gestao_servicos.assinaturas_anexo` (migration `20260831130000_add_servicos_anexo_assinatura.sql`)
e grava `anexo_assinado` em `historico_solicitacao`.

`anexos_solicitacao.assinaturas_necessarias` (1 ou 2, hoje sempre 1 — "mão dupla" com 2 ainda não
tem UI pra configurar) define quando o anexo é considerado totalmente assinado; `list_anexos`
retorna `assinaturas: [{ colaborador_id, nome, papel, assinado_em }]` por anexo, usado pro badge
"Assinado"/"Assinado (1/2)" na lista. Mão dupla completa (checkbox pra exigir os dois responsáveis
+ "assinar todos" em lote) é evolução futura, não implementada ainda.

## Shell mobile nativo (removido)

`servicos` já foi empacotado como app Android nativo via Capacitor (`android/`,
`capacitor.config.ts`, `NativeBackButtonHandler.jsx`, deps `@capacitor/*`). Decisão (2026-09-21):
o app não vai mais ser publicado em loja — todo esse shell nativo foi removido. `servicos`
continua só como web/PWA, igual aos demais apps do monorepo.
