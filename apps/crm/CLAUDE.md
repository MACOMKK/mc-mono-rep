# CRM (REVVO CRM) — app-specific

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
| `leads` | `origem_id` referencia `origens_lead` (FK), `status` (novo/tentativa_contato/em_contato/qualificado/negociacao/convertido/perdido), SLA, responsável |
| `atendimentos` | `tipo` (venda/pos_venda/agendamento/retorno), `temperatura` (frio/morno/quente) |
| `historico_atendimentos` | auditoria de mudanças |
| `veiculos_interesse` | veículos associados a um lead (1+ por lead, flag `principal`); `categoria_veiculo_id` (FK `categorias_veiculo`, **obrigatório**) define o segmento; `marca_id`/`modelo_id`/`versao_id` (FK `marcas_veiculo`/`modelos_veiculo`/`versoes_veiculo`) para catálogo estruturado, com `marca_outro`/`modelo_outro`/`versao_outro` como fallback quando o veículo ainda não está cadastrado (fallback é apenas interno — não há input de texto livre visível no `LeadForm.jsx`, só a opção "Não encontrei..." no select, decisão deliberada para não reintroduzir busca livre); `ano` é número livre, mas o `LeadForm.jsx` usa `ano_inicio`/`ano_fim` do modelo escolhido como `min`/`max` do input; `atributos` (jsonb) guarda os valores dos `campos_extra` do segmento (ex.: `{"cilindrada": 160}`) |
| `categorias_veiculo` | catálogo de **segmento** de veículo (`nome`, `ativo`) — cadastro livre via tela de configuração (admin/gestor); `campos_extra` (jsonb, lista de `{chave, label, tipo, opcoes?}`) define os atributos específicos daquele segmento (ex.: Moto → cilindrada; Carro → nº de portas, câmbio), editável na própria tela `CategoriasVeiculo.jsx` |
| `marcas_veiculo` | catálogo de marcas (`nome`, `ativo`) — independente de segmento (uma marca pode vender carro e moto) |
| `modelos_veiculo` | catálogo de modelos (`nome`, `ativo`, `marca_id` FK, `categoria_veiculo_id` FK, `ano_inicio`/`ano_fim` opcionais) — é o modelo que amarra marca a um segmento (ex.: Honda Civic = Carro, Honda CG = Moto); `ano_fim` nulo = ainda em produção. É uma faixa aproximada (não por versão) — deliberadamente mais simples que um catálogo estilo FIPE/Linx com código por versão+ano, adotado só se surgir necessidade real de integração de preço/seguro |
| `versoes_veiculo` | catálogo de versões (`nome`, `ativo`, `modelo_id` FK) — amarra a versão ao modelo (ex.: Civic LX, Civic Touring), mesmo padrão de cadastro livre dos demais catálogos |
| `origens_lead` | catálogo de origens de lead (`nome`, `ativo`) — mesmo padrão de `categorias_veiculo`; substituiu o antigo `leads.origem` (texto com `check` fixo) em `20260909110000_add_crm_origens_lead.sql` |
| `veiculos_estoque` | **extensão comercial** de um `public.veiculos` (ver abaixo) — não é dono do dado físico do carro. Campos próprios: `veiculo_id` (FK `public.veiculos`, unique — 1:1), `condicao` (novo/seminovo/usado), `status` (disponivel/reservado/vendido), `preco`, `observacoes`. Tela `Estoque.jsx` (rota `/estoque`, saiu do `comingSoon` do Navbar): leitura liberada para qualquer usuário com acesso ao CRM (`crm_has_access()`), criação/edição restrita a admin/gestor (`ensureCanConfigure`) — diferente dos catálogos de configuração, mas assim mesmo porque é dado operacional (inventário), não parametrização do sistema. Create/update passam pela action composta `save_veiculo_estoque_full` (`crm-api`, mesmo padrão de `save_lead_full`), que grava em `public.veiculos` e `gestao_crm.veiculos_estoque` na mesma transação; `list`/`get` fazem join (`row_to_json(v) as veiculo`) e o `crmDataClient` remonta os campos como um objeto plano. A baixa (`status='vendido'`) agora é automática ao fechar uma venda (ver `vendas` abaixo) — a edição manual do `status` continua disponível na tela para casos fora desse fluxo (ex.: reservar, tirar de circulação) |
| `propostas` | orçamento formal (veículo + valor + condições) vinculado a um `lead_id`, `cliente_id` sempre derivado do lead (nunca aceito do payload). `veiculo_estoque_id` (FK `veiculos_estoque`) ou `veiculo_descricao` (texto livre, veículo ainda fora do estoque) — um dos dois é obrigatório (`propostas_veiculo_check`). `status` rascunho/enviada/aceita/recusada; a transição para `aceita` só acontece via action `accept_proposta` (nunca via `update` genérico — bloqueado em `index.ts`), porque tem efeito colateral obrigatório: criar o registro de `vendas`. Tela `Propostas.jsx` (rota `/propostas`). Atalho "Nova proposta" a partir do detalhe do Lead (`LeadViewer.jsx`/`Leads.jsx`) navega para `/propostas?leadId=<id>`, pré-selecionando o lead. Sem geração de PDF/documento nesta rodada (débito técnico conhecido) — dados já estruturados para isso quando for priorizado, mesmo padrão do Termo de Posse do Central (`supabase/functions/enviar-termo-gmail` + `_shared/email.ts`) |
| `vendas` | registro formal de venda: `lead_id`/`cliente_id`, `veiculo_estoque_id` (`unique` — um veículo só pode ser vendido uma vez), `vendedor_id`, `valor_final`, `forma_pagamento`, `motivo_status_id` (deve pertencer a `status='convertido'`, mesmo catálogo `motivos_status` exigido por `prepare_lead_phase1()`). Só é criada via `accept_proposta` (a partir de uma proposta) ou `close_venda` (venda direta, sem proposta) — nunca via `create` genérico (bloqueado em `index.ts`), porque o `INSERT` dispara `trg_crm_vendas_outcome`: baixa o veículo do estoque, converte o lead (`status='convertido'`) e grava em `historico_atendimentos` (`tipo='venda_fechada'`), tudo na mesma transação. A sincronização `leads.status='convertido' → clientes_crm.status_relacionamento='cliente'` é centralizada em `gestao_crm.sync_cliente_status_relacionamento()` (trigger em `leads`, `20260918120000_centralize_crm_cliente_status_sync.sql`) — não duplicar esse `UPDATE` em nenhuma função nova. **`leads.status` só pode virar `convertido` através de `accept_proposta`/`close_venda` ou do resultado de atividade `venda_realizada`** (`20260918140000_require_venda_for_lead_convertido.sql`): `prepare_lead_phase1()` bloqueia qualquer outra tentativa (edição manual via Kanban/API) checando a GUC de transação `gestao_crm.allow_convertido`, setada só por `apply_venda_outcome()`/`apply_activity_outcome()` antes do `UPDATE leads`; no frontend, a coluna "Convertido" do Kanban (`LeadsKanban.jsx`) tem `isDropDisabled`. Histórico de vendas de um cliente aparece na aba "Vendas" do detalhe do Cliente (`Clientes.jsx`, via `Venda.listPage({ filters: { cliente_id } })`). Cobertura de teste da lógica de cálculo/validação (`valor_final`, aceite sem veículo vinculado) em `apps/crm/src/test/proposta-venda.rules.test.js`. **Cancelamento/estorno de venda** (`20260923120000_add_crm_venda_cancelamento.sql`): soft cancel — a linha nunca é apagada, só ganha `status='cancelada'`, `motivo_cancelamento`, `cancelada_em`, `cancelada_por`; o índice único em `veiculo_estoque_id` virou parcial (`idx_crm_vendas_veiculo_estoque_ativo`, `where status='concluida'`), permitindo vender o mesmo veículo de novo. Única porta é a action `cancel_venda` (`update` genérico bloqueado quando o payload mexe em `status`, mesmo padrão do bloqueio de `propostas.status='aceita'`), restrita a admin/gestor (`ensureCanConfigure`) — botão "Cancelar venda" só aparece na aba "Vendas" do Cliente para esses papéis. Dentro da transação: devolve o veículo para `disponivel` sempre; só reabre o lead (`status='negociacao'`, sem exigir nenhum dado extra no payload) se ele ainda estiver `convertido` — se já mudou de status por outro motivo, não mexe. A proposta associada (quando houver) **não** é revertida, continua `'aceita'` como registro histórico do que foi ofertado/aceito. **Fora de escopo (débito técnico):** comissão de vendedor — ver comentário no cabeçalho de `20260918110000_add_crm_vendas.sql` |

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
catálogo de Marca/Modelo/Versão **não** foi movido para `public` junto — continua em `gestao_crm`
por ser configuração do CRM; se `servicos` precisar dele no futuro, resolve-se via API, não por FK
cruzada, para não alastrar escopo. **Trade-off aceito conscientemente:** compartilhar
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
| `conversas_atendimento` / `mensagens_atendimento` | chat de atendimento via WhatsApp + IA (módulo "Atendimento", em construção) |
| `pipelines` / `etapas_pipeline` | funis configuráveis (tela `/configuracoes/pipelines`) — **fase 1, ainda desacoplada de `leads`**: `leads.status` continua sendo o enum fixo de sempre (Kanban/Dashboard/`prepare_lead_phase1` inalterados). `etapas_pipeline.chave_sistema` (nullable) marca etapas travadas — sem ela apagáveis/livres, com ela protegidas por trigger (`gestao_crm.protect_crm_pipeline_sistema()`, `20260912130000_add_crm_pipelines.sql`): nome/cor seguem editáveis, mas não dá para excluir, trocar de pipeline ou remover a chave. O pipeline `padrao = true` (seed "Comercial", espelhando as 7 etapas do funil atual) também não pode ser excluído. Se a fase 2 (religar `leads` a `etapa_id` em vez do enum) avançar, revisitar `LeadsKanban.jsx`/`leadStatus.js`/`Leads.jsx`/`Dashboard.jsx` e o trigger de distribuição — não faz parte do escopo atual |

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

## Atendimento (WhatsApp + IA)

Módulo em construção (rótulo "Atendimento" no Navbar, ainda `comingSoon: true`). Ao contrário
das demais entidades, **não** passa pelo `crm-api`: a Edge Function
`supabase/functions/whatsapp-api/index.ts` é desacoplada de propósito (nome genérico, não
`crm-whatsapp-api`), para permitir desvincular do CRM no futuro. Ela não exige JWT de usuário —
autentica pelo secret do próprio canal (verify token da Meta + assinatura HMAC), usa
`SUPABASE_SERVICE_ROLE_KEY` e bypassa RLS na escrita (mesmo padrão de `processa-fila-email`/
`enviar-termo-gmail`, não o do `crm-api`). Ver `supabase/functions/whatsapp-api/README.md` para
configuração de secrets e status de implementação/teste.

`conversas_atendimento` vincula a `clientes`/`leads` via `telefone_normalizado` (mesma
normalização — apenas dígitos — usada em `standardize_crm_contact_fields`); conversas sem
vínculo (número desconhecido) só são visíveis para admin via RLS até serem associadas a um
cliente/lead. `mensagens_atendimento.autor` distingue `cliente`/`ia`/`humano`; conversa com
`status = 'aguardando_humano'` pausa a resposta automática da IA.

Faltam: página `apps/crm/src/pages/Atendimento.jsx` (rota `/atendimento` — `/atendimentos`
plural já é redirect para `/atividades`, não confundir), client de API dedicado (não via
`crm-api`, já que os dados são gravados pela `whatsapp-api`), e deploy/configuração real dos
secrets no painel da Meta.

## Realtime

`useCrmRealtime.js` escuta INSERT/UPDATE/DELETE em `gestao_crm` (leads, clientes, atendimentos,
historico_atendimentos, veiculos_interesse, categorias_veiculo, origens_lead, marcas_veiculo,
modelos_veiculo, versoes_veiculo, veiculos_estoque, configuracoes_distribuicao, vendedores_distribuicao,
conversas_atendimento, mensagens_atendimento) **e também em `public.veiculos`** — `REALTIME_TABLES`
guarda `{schema, table}` por entrada (não só o nome) justamente por causa disso — e sincroniza o
cache do React Query. Estados possíveis: `connecting`, `active`, `syncing`, `error`, `disabled`.
Ao adicionar uma nova tabela (`gestao_crm` ou outro schema) que precise refletir em tempo real na
UI, lembrar de registrá-la aqui também.

## Stripe

Não há integração Stripe implementada neste app hoje (apenas dependência declarada em `package.json`,
sem uso no código). Se for adicionada, documentar aqui o fluxo (webhooks, edge function envolvida, etc).

## Convenções

- Toda entidade nova deve passar pelo padrão CRUD genérico da `crm-api`, evitando endpoints ad-hoc.
- Alterações de schema em `gestao_crm` devem considerar o impacto no Realtime (ver seção acima).
