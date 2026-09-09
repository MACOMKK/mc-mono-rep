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
| `veiculos_interesse` | veículos associados a um lead; `categoria_veiculo_id` referencia `categorias_veiculo` (FK), pois a concessionária pode vender motos e/ou carros |
| `categorias_veiculo` | catálogo de categorias de veículo (`nome`, `ativo`) — cadastro livre via tela de configuração (admin/gestor), sem lista fixa no schema |
| `origens_lead` | catálogo de origens de lead (`nome`, `ativo`) — mesmo padrão de `categorias_veiculo`; substituiu o antigo `leads.origem` (texto com `check` fixo) em `20260909110000_add_crm_origens_lead.sql` |
| `configuracoes_distribuicao` / `vendedores_distribuicao` | regras de distribuição automática de leads |
| `conversas_atendimento` / `mensagens_atendimento` | chat de atendimento via WhatsApp + IA (módulo "Atendimento", em construção) |

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
historico_atendimentos, veiculos_interesse, categorias_veiculo, origens_lead, configuracoes_distribuicao,
vendedores_distribuicao, conversas_atendimento, mensagens_atendimento)
e sincroniza o cache do React Query. Estados possíveis: `connecting`, `active`, `syncing`, `error`, `disabled`.
Ao adicionar uma nova tabela ao schema `gestao_crm` que precise refletir em tempo real na UI,
lembrar de registrá-la aqui também.

## Stripe

Não há integração Stripe implementada neste app hoje (apenas dependência declarada em `package.json`,
sem uso no código). Se for adicionada, documentar aqui o fluxo (webhooks, edge function envolvida, etc).

## Convenções

- Toda entidade nova deve passar pelo padrão CRUD genérico da `crm-api`, evitando endpoints ad-hoc.
- Alterações de schema em `gestao_crm` devem considerar o impacto no Realtime (ver seção acima).
