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
  - Actions específicas: `me`, `list_responsaveis`, `get_distribution_config`, `save_distribution_config`, `clear_crm_test_data`
- Schema: `gestao_crm` (migrations em `supabase/migrations/*gestao_crm*`)

### Entidades principais

| Tabela | Campos-chave |
|---|---|
| `clientes` | `status_relacionamento` (lead/cliente/pos_venda) |
| `leads` | `origem_id` referencia `origens_lead` (FK), `status` (novo/tentativa_contato/em_contato/qualificado/proposta/convertido/perdido), SLA, responsável |
| `atendimentos` | `tipo` (venda/pos_venda/agendamento/retorno), `temperatura` (frio/morno/quente) |
| `historico_atendimentos` | auditoria de mudanças |
| `veiculos_interesse` | veículos associados a um lead (1+ por lead, flag `principal`); `categoria_veiculo_id` (FK `categorias_veiculo`, **obrigatório**) define o segmento; `marca_id`/`modelo_id`/`versao_id` (FK `marcas_veiculo`/`modelos_veiculo`/`versoes_veiculo`) para catálogo estruturado, com `marca_outro`/`modelo_outro`/`versao_outro` como fallback quando o veículo ainda não está cadastrado (fallback é apenas interno — não há input de texto livre visível no `LeadForm.jsx`, só a opção "Não encontrei..." no select, decisão deliberada para não reintroduzir busca livre); `ano` é número livre, mas o `LeadForm.jsx` usa `ano_inicio`/`ano_fim` do modelo escolhido como `min`/`max` do input; `atributos` (jsonb) guarda os valores dos `campos_extra` do segmento (ex.: `{"cilindrada": 160}`) |
| `categorias_veiculo` | catálogo de **segmento** de veículo (`nome`, `ativo`) — cadastro livre via tela de configuração (admin/gestor); `campos_extra` (jsonb, lista de `{chave, label, tipo, opcoes?}`) define os atributos específicos daquele segmento (ex.: Moto → cilindrada; Carro → nº de portas, câmbio), editável na própria tela `CategoriasVeiculo.jsx` |
| `marcas_veiculo` | catálogo de marcas (`nome`, `ativo`) — independente de segmento (uma marca pode vender carro e moto) |
| `modelos_veiculo` | catálogo de modelos (`nome`, `ativo`, `marca_id` FK, `categoria_veiculo_id` FK, `ano_inicio`/`ano_fim` opcionais) — é o modelo que amarra marca a um segmento (ex.: Honda Civic = Carro, Honda CG = Moto); `ano_fim` nulo = ainda em produção. É uma faixa aproximada (não por versão) — deliberadamente mais simples que um catálogo estilo FIPE/Linx com código por versão+ano, adotado só se surgir necessidade real de integração de preço/seguro |
| `versoes_veiculo` | catálogo de versões (`nome`, `ativo`, `modelo_id` FK) — amarra a versão ao modelo (ex.: Civic LX, Civic Touring), mesmo padrão de cadastro livre dos demais catálogos |
| `origens_lead` | catálogo de origens de lead (`nome`, `ativo`) — mesmo padrão de `categorias_veiculo`; substituiu o antigo `leads.origem` (texto com `check` fixo) em `20260909110000_add_crm_origens_lead.sql` |
| `veiculos_estoque` | veículo físico em estoque (não é "interesse do lead") — `chassi` (unique, obrigatório), `placa`, `cor`, `km`, `condicao` (novo/seminovo/usado), `status` (disponivel/reservado/vendido), `preco`; reaproveita `modelo_id`/`versao_id` (FK `modelos_veiculo`/`versoes_veiculo`) com `modelo_outro`/`versao_outro` como fallback (colunas existem, sem input de texto na UI — mesmo padrão dos demais catálogos). Sem coluna própria de `ano`: o ano já vem do `modelo_id` escolhido (`ano_inicio`/`ano_fim` de `modelos_veiculo`), evitaria duplicar/discordar do dado. Tela `Estoque.jsx` (rota `/estoque`, saiu do `comingSoon` do Navbar): leitura liberada para qualquer usuário com acesso ao CRM (`crm_has_access()`), criação/edição restrita a admin/gestor (`ensureCanConfigure`) — diferente dos catálogos de configuração, mas assim mesmo porque é dado operacional (inventário), não parametrização do sistema. Ainda não tem workflow de reserva/venda (vínculo com lead, baixa automática do estoque na conversão) — próximo passo natural quando o módulo Estoque virar prioridade, fora do escopo desta rodada |

Todos os catálogos acima (`categorias_veiculo`, `marcas_veiculo`, `modelos_veiculo`, `versoes_veiculo`,
`origens_lead`) são **globais** hoje (sem `empresa_id`) — decisão consciente enquanto o app roda para
uma única empresa. Se o produto virar multiempresa, todos precisam ganhar `empresa_id` juntos (FK + RLS
por empresa + `unique (empresa_id, nome)` no lugar de `unique (nome)`/`unique (modelo_id, nome)`).
`veiculos_estoque` entra na mesma decisão se isso acontecer.
| `configuracoes_distribuicao` / `vendedores_distribuicao` | regras de distribuição automática de leads |
| `conversas_atendimento` / `mensagens_atendimento` | chat de atendimento via WhatsApp + IA (módulo "Atendimento", em construção) |

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
conversas_atendimento, mensagens_atendimento)
e sincroniza o cache do React Query. Estados possíveis: `connecting`, `active`, `syncing`, `error`, `disabled`.
Ao adicionar uma nova tabela ao schema `gestao_crm` que precise refletir em tempo real na UI,
lembrar de registrá-la aqui também.

## Stripe

Não há integração Stripe implementada neste app hoje (apenas dependência declarada em `package.json`,
sem uso no código). Se for adicionada, documentar aqui o fluxo (webhooks, edge function envolvida, etc).

## Convenções

- Toda entidade nova deve passar pelo padrão CRUD genérico da `crm-api`, evitando endpoints ad-hoc.
- Alterações de schema em `gestao_crm` devem considerar o impacto no Realtime (ver seção acima).
