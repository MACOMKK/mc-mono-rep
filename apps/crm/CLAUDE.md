# CRM — app-specific

> Este arquivo complementa o CLAUDE.md raiz do monorepo. Só documenta o que é específico deste app.

## Domínio

Gestão comercial automotiva: leads, clientes, atendimentos e distribuição para vendedores.

## Estrutura

- `src/api/` — clients de API (chama `crm-api`)
- `src/context/` — `AuthContext`, `EmpresaContext`
- `src/hooks/useCrmRealtime.js` — assinatura Supabase Realtime
- `src/components/leads/`, `src/components/eventos/` — componentes por domínio
- `src/pages/` — telas

## Backend

- Edge Function: `supabase/functions/crm-api/index.ts`
  - CRUD genérico (`get`/`list`/`create`/`update`/`delete`) sobre as entidades abaixo
  - Actions específicas: `me`, `list_responsaveis`, `get_distribution_config`, `save_distribution_config`, `clear_crm_test_data`, `save_lead_full`, `save_evento_full`, `save_veiculo_estoque_full`, `accept_proposta`, `close_venda`
- Schema: `gestao_crm` (migrations em `supabase/migrations/*gestao_crm*`)

### Entidades principais

| Tabela | Campos-chave |
|---|---|
| `clientes` | `status_relacionamento` (lead/cliente/pos_venda) |
| `leads` | `origem_id` referencia `origens_lead` (FK), `pipeline_id`/`etapa_id`/`etapa_tipo` (posição no pipeline — `leads.status` foi removida na fase 2.6), SLA, responsável |
| `atendimentos` | `tipo` (venda/pos_venda/agendamento/retorno), `temperatura` (frio/morno/quente) |
| `historico_atendimentos` | auditoria de mudanças. Alterações do lead (responsável, status, dados comerciais) são gravadas **só** pelo trigger `register_lead_change_history` (`20261002130000`), que cobre todos os caminhos (tela, atividade, venda, cancelamento) — não gravar histórico de troca de status na `crm-api` nem em outra função |
| `veiculos_interesse` | veículos associados a um lead (1+ por lead, flag `principal`); `categoria_veiculo_id` (FK `categorias_veiculo`, **obrigatório**) define o segmento; `marca_id`/`modelo_id`/`versao_id` (FK `marcas_veiculo`/`modelos_veiculo`/`versoes_veiculo`) para catálogo estruturado, com `marca_outro`/`modelo_outro`/`versao_outro` como fallback quando o veículo ainda não está cadastrado (fallback é apenas interno — não há input de texto livre visível no `LeadForm.jsx`, só a opção "Não encontrei..." no select, decisão deliberada para não reintroduzir busca livre); `ano` é número livre, mas o `LeadForm.jsx` usa `ano_inicio`/`ano_fim` do modelo escolhido como `min`/`max` do input; `atributos` (jsonb) guarda os valores dos `campos_extra` do segmento (ex.: `{"cilindrada": 160}`) |
| `categorias_veiculo` | catálogo de **segmento** de veículo (`nome`, `ativo`) — cadastro livre via tela de configuração (admin/gestor); `campos_extra` (jsonb, lista de `{chave, label, tipo, opcoes?}`) define os atributos específicos daquele segmento (ex.: Moto → cilindrada; Carro → nº de portas, câmbio), editável na própria tela `CategoriasVeiculo.jsx` |
| `marcas_veiculo` | catálogo de marcas (`nome`, `ativo`) — independente de segmento (uma marca pode vender carro e moto) |
| `modelos_veiculo` | catálogo de modelos (`nome`, `ativo`, `marca_id` FK, `categoria_veiculo_id` FK, `ano_inicio`/`ano_fim` opcionais) — é o modelo que amarra marca a um segmento (ex.: Honda Civic = Carro, Honda CG = Moto); `ano_fim` nulo = ainda em produção. É uma faixa aproximada (não por versão) — deliberadamente mais simples que um catálogo estilo FIPE/Linx com código por versão+ano, adotado só se surgir necessidade real de integração de preço/seguro |
| `versoes_veiculo` | catálogo de versões (`nome`, `ativo`, `modelo_id` FK) — amarra a versão ao modelo (ex.: Civic LX, Civic Touring), mesmo padrão de cadastro livre dos demais catálogos |
| `origens_lead` | catálogo de origens de lead (`nome`, `ativo`) — mesmo padrão de `categorias_veiculo`; substituiu o antigo `leads.origem` (texto com `check` fixo) em `20260909110000_add_crm_origens_lead.sql` |
| `veiculos_estoque` | **extensão comercial** de um `public.veiculos` (ver abaixo) — não é dono do dado físico do carro. Campos próprios: `veiculo_id` (FK `public.veiculos`, unique — 1:1), `condicao` (novo/seminovo/usado), `status` (disponivel/reservado/vendido), `preco`, `observacoes`. Tela `Estoque.jsx` (rota `/estoque`, saiu do `comingSoon` do Navbar): leitura liberada para qualquer usuário com acesso ao CRM (`crm_has_access()`), criação/edição restrita a admin/gestor (`ensureCanConfigure`) — diferente dos catálogos de configuração, mas assim mesmo porque é dado operacional (inventário), não parametrização do sistema. Create/update passam pela action composta `save_veiculo_estoque_full` (`crm-api`, mesmo padrão de `save_lead_full`), que grava em `public.veiculos` e `gestao_crm.veiculos_estoque` na mesma transação; `list`/`get` fazem join (`row_to_json(v) as veiculo`) e o `crmDataClient` remonta os campos como um objeto plano. A baixa (`status='vendido'`) agora é automática ao fechar uma venda (ver `vendas` abaixo) — a edição manual do `status` continua disponível na tela para casos fora desse fluxo (ex.: reservar, tirar de circulação). **Situação e reserva** (`20261001140000`…`20261021110000`): `situacao` (estoque/transito/saida_demonstracao/imobilizado) é manual; só `imobilizado` bloqueia proposta e venda (`ensure_veiculo_estoque_disponivel()`), `transito` e `saida_demonstracao` são só informativas. Na tela, as colunas Situação e Status têm badge colorido (`SITUACAO_BADGE_CLASS`/`STATUS_BADGE_CLASS` em `Estoque.jsx`). `chk_veiculos_estoque_reserva_consistente` (`20261016160000`, simétrica) exige `vendedor_reserva_id`+`cliente_reserva_id` preenchidos se e somente se `status='reservado'` — a trigger `trg_crm_veiculos_estoque_clear_reserva` zera os dois campos automaticamente sempre que `status` sai de `'reservado'` (cobre `apply_venda_outcome()` e qualquer update manual). Só o vendedor da reserva pode criar/editar proposta (`prepare_proposta_business_state()`) ou ter venda registrada (trigger `BEFORE INSERT` `trg_crm_vendas_validate_veiculo_estoque`, cobre `accept_proposta` e `close_venda`). Na tela, o diálogo "Editar reserva" (`Estoque.jsx`, `handleSalvarReserva`) é quem decide o `status` — preencher vendedor+cliente manda `status='reservado'` junto, e limpar os dois campos devolve `status='disponivel'` (se já estava `reservado`); a combobox de Status sozinha não consegue setar `'reservado'` sem reserva preenchida (a constraint rejeita) |
| `propostas` | orçamento formal (veículo + valor + condições) vinculado a um `lead_id`, `cliente_id` sempre derivado do lead (nunca aceito do payload). `veiculo_estoque_id` (FK `veiculos_estoque`) ou `veiculo_descricao` (texto livre, veículo ainda fora do estoque) — um dos dois é obrigatório (`propostas_veiculo_check`). `status` rascunho/enviada/aceita/recusada; a transição para `aceita` só acontece via action `accept_proposta` (nunca via `update` genérico — bloqueado em `index.ts`), porque tem efeito colateral obrigatório: criar o registro de `vendas`. Tela `Propostas.jsx` (rota `/propostas`). Atalho "Nova proposta" a partir do detalhe do Lead (`LeadViewer.jsx`/`Leads.jsx`) navega para `/propostas?leadId=<id>`, pré-selecionando o lead. Botão "Editar" (`rascunho`/`enviada`) reabre o mesmo diálogo pré-preenchido e chama `update` via `PropostaRepository.update` — o lead vinculado não é trocável na edição (travado na UI; trocar mudaria `cliente_id` via trigger). Exportação via botão "Imprimir" → `PropostaDocumento.jsx` → `window.print()` (PDF pelo diálogo de impressão do navegador, não é geração server-side — suficiente pra necessidade atual, geração formal server-side segue como débito técnico se for priorizada depois, mesmo padrão do Termo de Posse do Central, `supabase/functions/enviar-termo-gmail` + `_shared/email.ts`). Duplicidade por `cliente_id`+veículo (mesmo `veiculo_estoque_id` ou mesmo `veiculo_descricao` normalizado) com proposta em `rascunho`/`enviada` é bloqueada por índice único parcial (`idx_crm_propostas_cliente_veiculo_estoque_ativa_unique`/`..._descricao_ativa_unique`, `20261021100000`) — propostas `aceita`/`recusada` não contam pro bloqueio, e veículos diferentes do mesmo cliente continuam permitidos |
| `vendas` | registro formal de venda: `lead_id`/`cliente_id`, `veiculo_estoque_id` (`unique` — um veículo só pode ser vendido uma vez), `vendedor_id`, `valor_final`, `forma_pagamento`, `motivo_status_id` (deve pertencer a `aplica_em` de ganho, mesmo catálogo `motivos_status` exigido por `prepare_lead_phase1()`). Só é criada via `accept_proposta` (a partir de uma proposta) ou `close_venda` (venda direta, sem proposta) — nunca via `create` genérico (bloqueado em `index.ts`), porque o `INSERT` dispara `trg_crm_vendas_outcome`: move o lead para a etapa de ganho do pipeline (`etapa_tipo='ganho'`), baixa o veículo do estoque e grava em `historico_atendimentos` (`tipo='venda_fechada'`), tudo na mesma transação. A sincronização `leads` em etapa de ganho (`etapa_tipo='ganho'`) → `clientes_crm.status_relacionamento='cliente'` é centralizada em `gestao_crm.sync_cliente_status_relacionamento()` (trigger em `leads`, `20260918120000_centralize_crm_cliente_status_sync.sql`) — não duplicar esse `UPDATE` em nenhuma função nova. **O lead só pode entrar na etapa de ganho através de `accept_proposta`/`close_venda` ou do resultado de atividade `venda_realizada`** (`20260918140000_require_venda_for_lead_convertido.sql`): `prepare_lead_phase1()` bloqueia qualquer outra tentativa (edição manual via Kanban/API) checando a GUC de transação `gestao_crm.allow_convertido`, setada só por `apply_venda_outcome()`/`apply_activity_outcome()` antes do `UPDATE leads`; no frontend, a coluna "Convertido" do Kanban (`LeadsKanban.jsx`) tem `isDropDisabled`. Histórico de vendas de um cliente aparece na aba "Vendas" do detalhe do Cliente (`Clientes.jsx`, via `Venda.listPage({ filters: { cliente_id } })`). Cobertura de teste da lógica de cálculo/validação (`valor_final`, aceite sem veículo vinculado) em `apps/crm/src/test/proposta-venda.rules.test.js`. **Cancelamento/estorno de venda** (`20260923120000_add_crm_venda_cancelamento.sql`): soft cancel — a linha nunca é apagada, só ganha `status='cancelada'`, `motivo_cancelamento`, `cancelada_em`, `cancelada_por`; o índice único em `veiculo_estoque_id` virou parcial (`idx_crm_vendas_veiculo_estoque_ativo`, `where status='concluida'`), permitindo vender o mesmo veículo de novo. Única porta é a action `cancel_venda` (`update` genérico bloqueado quando o payload mexe em `status`, mesmo padrão do bloqueio de `propostas.status='aceita'`), restrita a admin/gestor (`ensureCanConfigure`) — botão "Cancelar venda" só aparece na aba "Vendas" do Cliente para esses papéis. Dentro da transação: devolve o veículo para `disponivel` sempre; só reabre o lead numa etapa `em_andamento` do pipeline (sem exigir nenhum dado extra no payload) se ele ainda estiver na etapa de ganho — se já saiu dela por outro motivo, não mexe. A proposta associada (quando houver) **não** é revertida, continua `'aceita'` como registro histórico do que foi ofertado/aceito. **Fora de escopo (débito técnico):** comissão de vendedor — ver comentário no cabeçalho de `20260918110000_add_crm_vendas.sql` |

`public.veiculos` (schema **`public`**, fora de `gestao_crm` — decisão deliberada) é o veículo
físico central: `chassi` (unique, obrigatório), `placa`, `cor`, `km`, `modelo_id`/`versao_id` (FK
`gestao_crm.modelos_veiculo`/`versoes_veiculo`, ambos obrigatórios via select — **sem** fallback de
texto livre tipo `modelo_outro`/`versao_outro`; diferente de `veiculos_interesse`, aqui o veículo
sempre precisa existir no catálogo). Para não travar o cadastro quando o modelo/versão ainda não
existe, `Estoque.jsx` tem um botão "+" ao lado de cada select que abre um dialog e cria a linha em
`modelos_veiculo`/`versoes_veiculo` na hora (mesmos campos/mutations de `ModelosVeiculo.jsx`/
`VersoesVeiculo.jsx`), selecionando o novo registro automaticamente — sem sair da tela de Estoque.
Sem coluna própria de `ano`: já vem do `modelo_id` escolhido (`ano_inicio`/`ano_fim` de
`modelos_veiculo`). Motivo de ficar em `public` (mesmo espírito de `public.colaboradores`, entidade
global usada por todos os apps): chassi/placa/cor/km descrevem a unidade física, não um conceito
exclusivo de venda — o módulo Oficina do app `servicos` (ainda não implementado) vai precisar
identificar o mesmo carro (abrir OS, registrar km em revisão), e duplicar esses campos por app
faria km/cor divergirem e impediria cruzar histórico do mesmo veículo entre CRM e Oficina. O
catálogo de Marca/Modelo/Versão (`marcas_veiculo`, `modelos_veiculo`, `versoes_veiculo`,
`categorias_veiculo`, `cores_veiculo`) está em **`public`**, não em `gestao_crm` (`20260914130000`)
— foi movido para junto de `public.veiculos` por ser referenciado por FK de lá; se `servicos`
precisar dele no futuro, resolve-se via API ou FK direta, sem alastrar escopo. **Trade-off aceito conscientemente:** compartilhar
`public.veiculos` acopla `crm` a qualquer app que também vier a escrever nele — se o `crm` for
desacoplado do monorepo algum dia, essa tabela deixa de ser "só copiar o schema `gestao_crm`" e
exige decidir quem fica dono dela e como o outro app sincroniza; aceitável hoje porque não há
separação no horizonte.

Todos os catálogos acima (`categorias_veiculo`, `marcas_veiculo`, `modelos_veiculo`, `versoes_veiculo`,
`origens_lead`) são **globais** hoje (sem `empresa_id`) — decisão consciente enquanto o app roda para
uma única empresa. Se o produto virar multiempresa, todos precisam ganhar `empresa_id` juntos (FK + RLS
por empresa + `unique (empresa_id, nome)` no lugar de `unique (nome)`/`unique (modelo_id, nome)`).
`veiculos_estoque`/`public.veiculos` entram na mesma decisão se isso acontecer.
| `configuracoes_distribuicao` / `vendedores_distribuicao` | regras de distribuição automática de leads |
| `conversas_atendimento` / `mensagens_atendimento` | chat de atendimento via WhatsApp + IA (módulo "Atendimento") |
| `pipelines` / `etapas_pipeline` | funis configuráveis (tela `/configuracoes/pipelines`). **Migração para etapas concluída** (`PLANO_LEADS_PIPELINE.local.md`, raiz). Fases 2.0/2.1 (`20261002140000_link_crm_leads_etapas_pipeline.sql`): `leads` ganhou `pipeline_id`, `etapa_id` (FK `on delete restrict`) e `etapa_tipo` (cópia de `etapas_pipeline.tipo` para índice parcial), e `etapas_pipeline` ganhou `tipo` (`em_andamento`/`ganho`/`perdido`). `etapas_pipeline.chave_sistema` (nullable) marca etapas de sistema, protegidas por `gestao_crm.protect_crm_pipeline_sistema()`: nome/cor editáveis, mas não dá para excluir, trocar de pipeline, remover a chave, trocar o `tipo`, inativar nem inverter a ordem relativa entre elas (novo < tentativa_contato < em_contato < qualificado < negociacao < convertido/perdido; etapas livres ficam em qualquer posição). Etapa com leads não pode ser excluída, inativada, nem trocar de `tipo` ou pipeline (`validate_etapa_pipeline_leads()`). O pipeline `padrao = true` (seed "Comercial") não pode ser excluído. **Fase 2.2** (`20261002150000`…`20261002220000`): as regras de negócio passaram a ler a etapa — motivo exigido por `chave_sistema='qualificado'` ou `tipo in (ganho, perdido)` (validado contra `motivos_status.aplica_em`, só quando etapa/motivo mudam), trava de ganho por `tipo='ganho'`, atividades movem o lead por `chave_sistema` com elegibilidade por `ordem`, cliente vira 'cliente' ao entrar em etapa de ganho, histórico grava a troca de etapa, índices parciais sobre `etapa_tipo` ("1 lead ativo por cliente **e pipeline**"). **Fases 2.4/2.5**: `crm-api` aceita `etapa_id`/`pipeline_id`, distribuição e `cancel_venda` por etapa; o front posiciona o lead por `etapa_id` (`hooks/usePipelineEtapas.js` + seletores em `lib/leadStatus.js`), Kanban com colunas = etapas ativas. **Fase 2.6 — corte do legado** (`20261015120000_crm_corte_leads_status.sql`): `leads.status` e `motivos_status.status` foram **removidos** (coluna dropada, não só descontinuada) — `sync_lead_etapa_status()` passou a resolver só `pipeline_id`/`etapa_id`/`etapa_tipo`, sem nenhuma leitura/escrita de `status`; `motivos_status` passou a usar só `aplica_em` (`unique (aplica_em, nome)`). `chave_sistema`/`tipo` continuam sendo a única fonte de verdade lida por todas as regras |

## Agenda de Atividades

`atendimentos` é a **única** fonte da Agenda de Atividades — não existe tabela `eventos`. A
entidade lógica `Atividade` usada no frontend (`crmDataClient.entities.Atividade`) é apenas um
alias do mesmo repositório de `Evento` (que opera sobre `atendimentos`). O modelo é
intencionalmente unificado: cada linha representa tanto a atividade **planejada** (`status`,
`proximo_contato`) quanto o **registro da interação/resultado** (`resultado`,
`motivo_resultado`, `concluido_em`) — não separar isso em duas entidades. `tipo_atendimento`
aceita `ligacao, whatsapp, email, visita, test_drive, tarefa` (simplificado em
`20260909140000_add_crm_veiculo_interesse_catalogo.sql`, removendo 4 valores legados nunca
usados na UI).

**Lembrete de ligação agendada** (`20261021120000`/`20261021130000`): `horario_proximo_contato`
(`time`, opcional) complementa `proximo_contato` só para `tipo_atendimento = 'ligacao'` — a
coluna em si continua `date` (não virou `timestamptz` para não tocar nos vários lugares que já
tratam `proximo_contato` como dia puro: `EventoCard.jsx`, `Clientes.jsx`, `normalizeDateOnly`).
Cron `crm-atividades-lembrete-ligacao` (a cada 15 min) notifica (`notificar()`,
`sistema: 'crm'`) o `leads.responsavel_id` quando `proximo_contato + horario_proximo_contato`
cai nos próximos 30 min; dedupe por `lembrete_ligacao_enviado_em`, zerado automaticamente
(trigger `reset_lembrete_ligacao_on_reschedule`) se a atividade for remarcada. O CRM ganhou aqui
seu primeiro consumidor de sino in-app (`NotificationBell` em `Navbar.jsx`, via
`useNotificacoes` de `@macom/notifications`) — sem Web Push por enquanto.

## Atendimento (WhatsApp + IA)

Módulo completo em produção (rótulo "Atendimento" no Navbar, rota `/atendimento` — `/atendimentos`
plural é redirect pra `/atividades`, não confundir). Página `apps/crm/src/pages/Atendimento.jsx` +
`components/atendimento/*` (lista de conversas com filtros rápidos — Todas/Não lidas/Minhas/Sem
responsável — e chat), client dedicado `apps/crm/src/api/atendimentoApi.js`.

A leitura/escrita do frontend passa pelo `crm-api`, igual às demais entidades de `gestao_crm`
(incluindo a action `send_atendimento_mensagem`, que envia a mensagem de fato via WhatsApp antes
de gravar). A escrita das mensagens **recebidas** é diferente: quem grava é a Edge Function
desacoplada `supabase/functions/whatsapp-api/index.ts` (nome genérico, não `crm-whatsapp-api`,
para permitir desvincular do CRM no futuro). Ela não exige JWT de usuário — autentica pelo secret
do próprio canal (verify token da Meta + assinatura HMAC), usa `SUPABASE_SERVICE_ROLE_KEY` e
bypassa RLS na escrita (mesmo padrão de `processa-fila-email`/`enviar-termo-gmail`, não o do
`crm-api`). Ver `supabase/functions/whatsapp-api/README.md` para configuração de secrets e status
de deploy/teste em runtime real — isso ainda está pendente, é a única parte não validada em
produção.

`conversas_atendimento` vincula a `clientes`/`leads` via `telefone_normalizado` (mesma
normalização — apenas dígitos — usada em `standardize_crm_contact_fields`); conversas sem
vínculo (número desconhecido) só são visíveis para admin via RLS até serem associadas a um
cliente/lead. `mensagens_atendimento.autor` distingue `cliente`/`ia`/`humano`; conversa com
`status = 'aguardando_humano'` pausa a resposta automática da IA.

## Realtime

`useCrmRealtime.js` escuta INSERT/UPDATE/DELETE em `gestao_crm` (leads, clientes, atendimentos,
historico_atendimentos, veiculos_interesse, categorias_veiculo, origens_lead, marcas_veiculo,
modelos_veiculo, versoes_veiculo, veiculos_estoque, configuracoes_distribuicao, vendedores_distribuicao,
conversas_atendimento, mensagens_atendimento, pipelines, etapas_pipeline, motivos_status) **e também em `public.veiculos`** — `REALTIME_TABLES`
guarda `{schema, table}` por entrada (não só o nome) justamente por causa disso — e sincroniza o
cache do React Query. Estados possíveis: `connecting`, `active`, `syncing`, `error`, `disabled`.
Ao adicionar uma nova tabela (`gestao_crm` ou outro schema) que precise refletir em tempo real na
UI, lembrar de registrá-la aqui também.

## Stripe

Não há integração Stripe implementada neste app hoje — a dependência chegou a ser declarada no
scaffold inicial (`@stripe/react-stripe-js`/`@stripe/stripe-js`), sem nenhum uso no código, e foi
removida do `package.json` (auditoria 2026-10-20, Nível 2). Se a integração for adicionada no
futuro, reinstalar a dependência e documentar aqui o fluxo (webhooks, edge function envolvida, etc).

## Convenções

- Toda entidade nova deve passar pelo padrão CRUD genérico da `crm-api`, evitando endpoints ad-hoc.
- Alterações de schema em `gestao_crm` devem considerar o impacto no Realtime (ver seção acima).
