# Arquitetura do MACOM Central

> Documento de visão de arquitetura: como os sistemas do monorepo se conectam
> entre si. Para regras de negócio e convenções específicas de cada app, veja
> o `CLAUDE.md` daquele app (mapa completo na seção 8). Para convenções gerais
> do monorepo (como rodar, como criar um app novo), veja o `CLAUDE.md` da
> raiz — este documento não repete o que já está lá, só explica as conexões.

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Mapa geral do sistema](#2-mapa-geral-do-sistema)
3. [Apps](#3-apps)
4. [Pacotes `@macom/*`](#4-pacotes-macom)
5. [Backend Supabase](#5-backend-supabase)
6. [Fluxos transversais](#6-fluxos-transversais-que-atravessam-múltiplos-sistemas)
7. [Como rodar e testar](#7-como-rodar-e-testar)
8. [Mapa de documentação](#8-mapa-de-documentação)

---

## 1. Visão geral

O MACOM Central é uma plataforma composta por **8 SPAs React independentes**
(`apps/*`), cada uma deployada como um **projeto Vercel separado**, mas todas
compartilhando:

- **um único projeto Supabase** (Postgres + Auth + Storage + Edge Functions
  em Deno) como backend;
- um conjunto de **pacotes internos `@macom/*`** (`packages/*`) para não
  duplicar UI, autenticação, cliente de API, validação e configuração de
  build entre os apps.

Não há Turborepo/Nx: a orquestração é feita via **npm workspaces**
(`package.json` raiz lista `apps/*` e `packages/*` como workspaces), e cada
app tem seus próprios scripts `dev`/`build`/`lint` registrados na raiz.

Cada app resolve um domínio de negócio diferente (gestão de ativos, CRM
automotivo, intranet corporativa, BI, financeiro/oficina), mas todos
autenticam contra o mesmo `auth.users` do Supabase e enxergam entidades
globais compartilhadas em `public` (`colaboradores`, `empresas`, `sistemas`,
`acessos_usuario_sistema`, `veiculos`, `clientes`).

## 2. Mapa geral do sistema

```
                         ┌─────────────────────────────────────────────┐
                         │              Vercel (8 deploys)              │
                         │  central · admin · crm · intranet · relatorios│
                         │  servicos · comunicacao · rh (placeholder)   │
                         └───────────────────┬───────────────────────────┘
                                             │ importam
                         ┌───────────────────▼───────────────────────────┐
                         │        packages/@macom/*  (npm workspaces)     │
                         │  ui · auth · api-client · config · validation  │
                         │  test-utils · assets · push · pdf-signature    │
                         └───────────────────┬───────────────────────────┘
                                             │ chamam via fetch + JWT
                         ┌───────────────────▼───────────────────────────┐
                         │     Supabase Edge Functions (Deno, 19 funcs)   │
                         │  <dominio>-api (dispatcher CRUD) + crons +     │
                         │  security-* + _shared/* (helpers comuns)       │
                         └───────────────────┬───────────────────────────┘
                                             │ postgres.js / supabase-js
                         ┌───────────────────▼───────────────────────────┐
                         │         Postgres único (projeto Supabase)      │
                         │  public (global) + gestao_<dominio> por app +  │
                         │  notificacoes · integracoes (schemas cruzados) │
                         └───────────────────┬───────────────────────────┘
                                             │
                         ┌───────────────────▼───────────────────────────┐
                         │   Supabase Auth (JWT) · Storage · Gmail API    │
                         └─────────────────────────────────────────────────┘
```

Ponto-chave: **um app nunca acessa o Postgres de outro schema diretamente
pelo navegador** — tudo passa pela Edge Function do próprio domínio, que
decide o que expor. A única forma de dado realmente compartilhado entre apps
é: (a) tabelas em `public` (ex.: `colaboradores`, `veiculos`), lidas por mais
de um `*-api`; ou (b) schemas transversais sem app dono (`notificacoes`,
`integracoes`).

## 3. Apps

| App | Domínio | Auth | Status |
|---|---|---|---|
| `central` | Ativos, infraestrutura, colaboradores, contratos, termos de posse | `@macom/auth` | Completo — único com Vitest/lint/typecheck dedicados |
| `admin` | Console de governança: cadastro de sistemas, usuários, permissões globais, auditoria, integrações | `@macom/auth` | Completo |
| `crm` | REVVO CRM: leads, clientes, estoque de veículos, propostas/vendas, atendimento WhatsApp+IA | `AuthContext` local | Completo (Atendimento/WhatsApp em construção) |
| `intranet` | Avisos, documentos, colaboradores, calendário, base de conhecimento, feedback | `AuthContext` local | Completo, com permissões granulares por módulo |
| `relatorios` | Dashboard de BI — embed de relatórios externos com controle de acesso por unidade/função | `AuthContext` local | Completo — tem backend Supabase próprio adicional (ver seção 5) |
| `servicos` | Multi-módulo oficina/concessionária: Financeiro (completo), Oficina/checklist (em construção), Estoque/Compras/RH (planejados) | `AuthContext` local | Módulo Financeiro completo; demais "em breve" |
| `comunicacao` | Chat interno | `AuthContext` local | Sem `CLAUDE.md` próprio ainda |
| `rh` | RH corporativo | — | Placeholder (sem `package.json`) |
| `_template` | Boilerplate para criar app novo | — | Não é um app real |

**Por que dois padrões de auth convivem:** `central` e `admin` usam o pacote
compartilhado `@macom/auth` (`AuthContext` + `ProtectedRoute` prontos). Os
demais têm cada um seu próprio `AuthContext.jsx` local
(`apps/<app>/src/lib/AuthContext.jsx`), com normalização de usuário e sessão
duplicadas — migrá-los é dívida técnica registrada mas deliberadamente
adiada (mexe em login já em produção; ver `CLAUDE.md` raiz para o histórico
completo dessa decisão). Consequência prática: qualquer comportamento de
sessão centralizado em `@macom/auth` (ex.: gate de troca de senha
obrigatória, seção 6) **não é herdado automaticamente** pelos apps com
`AuthContext` local — cada um reimplementa.

## 4. Pacotes `@macom/*`

| Pacote | Resolve | Consumido por |
|---|---|---|
| `ui` | Componentes visuais (Radix/shadcn-style): button, dialog, table, tabs, toast, `AccountMenu`, `PasswordChangeForm`, `AppFooter`, `SignaturePad`, `TurnstileWidget` etc. | Todos os apps |
| `auth` | `AuthContext` + `ProtectedRoute` prontos | `central`, `admin` |
| `api-client` | Clientes de API por domínio (`crmApi`, `intranetApi`, `financeiroApi`, `oficinaApi`, `platformUsersApi`, `platformPermissionsApi`, `platformAuditApi`, `platformIntegrationsApi`, `comunicacaoApi`) + `supabaseClient` compartilhado + `signatureStorage` | Todos os apps — camada única de acesso às Edge Functions, evita cada app montar `fetch` cru |
| `config` | Factories de ESLint, Tailwind, PostCSS, `jsconfig` reutilizadas | Build/lint/dev de todos os apps |
| `validation` | Schemas/regex compartilhados (dígitos, correspondência de texto) | Formulários de vários apps |
| `test-utils` | Setup e fixtures de teste | `central` (Vitest), `crm` (Vitest) |
| `assets` | Ícones/favicons/PWA icons centrais, sincronizados via `npm run sync:favicons` | Todos os apps (branding consistente) |
| `push` | Cliente Web Push (`pushClient.js`, `usePushNotifications.js`) | Apps que usam a `push-api` (hoje `servicos`) |
| `pdf-signature` | Merge de PDF + carimbo de assinatura posicionável (`@macom/pdf-signature`, genérico — não sabe nada de domínio) | `servicos` (PDF único e assinatura de anexos do Financeiro), extraído para reuso futuro |

Regra geral: antes de duplicar lógica de validação, chamada de API ou
componente de UI num app, verificar se já existe em um desses pacotes.

## 5. Backend Supabase

### 5.1 Schemas do Postgres

- **`public`** — entidades globais usadas por múltiplos apps: `colaboradores`
  (inclui `precisa_trocar_senha`, `foto_url`, `assinatura_url` — dado de
  identidade compartilhado), `empresas`, `sistemas`, `acessos_usuario_sistema`
  (Camada 1 de acesso, ver seção 6), `veiculos` (extraído para ser
  reaproveitado por `crm` e `servicos`/Oficina), `clientes`.
- **`gestao_ativos`** — dados do `central` (ativos, infraestrutura, linhas
  corporativas, termos de posse, `permissoes_central`).
- **`gestao_plataforma`** — governança/auditoria do `admin` (`logs_acesso`,
  auditoria, integrações administrativas).
- **`gestao_crm`** — dados do `crm` (leads, atendimentos, catálogos de
  veículo, propostas, vendas — `public.veiculos` fica de fora de propósito,
  ver `CLAUDE.md` do CRM).
- **`gestao_intranet`** — dados da `intranet` (avisos, documentos,
  `permissoes_usuario` — Camada 2 de permissão do app).
- **`gestao_relatorio`** — dados do `relatorios` (catálogo de relatórios,
  `permissoes_funcoes`, escopo por unidade).
- **`gestao_servicos`** — dados do `servicos` (solicitações de pagamento do
  Financeiro, `permissoes_modulo` por módulo, checklist da Oficina).
- **`gestao_comunicacao`** — dados do `comunicacao`.
- **`notificacoes`** e **`integracoes`** — schemas **transversais, sem app
  dono** (ver seção 6).

Não existe um `schema.sql` consolidado na raiz: o estado atual só é
reconstituível aplicando a sequência completa das ~267 migrations em
`supabase/migrations/` (exceção: `relatorios` tem migrations locais próprias
em `apps/relatorios/supabase/`, separadas das da raiz).

### 5.2 Edge Functions (`supabase/functions/`)

A maioria segue o padrão **dispatcher por domínio** (`<dominio>-api`): uma
única function com um `ENTITY_CONFIG`/roteador interno que expõe operações
CRUD genéricas (`list`/`get`/`create`/`update`/`delete`) mais actions
específicas de negócio. Exceções: `servicos-api` (uma entidade principal só,
sem motor genérico) e `servicos-oficina-api` (separada de `servicos-api` de
propósito — ver 5.2.1).

| Function | Tipo | Responsabilidade |
|---|---|---|
| `central-api` | dispatcher | Entidades do `central` (`gestao_ativos` + leitura de `public`) |
| `admin-create-user` | ação pontual | Criação de usuário via service role (Console) |
| `plataforma-api` | dispatcher | Core/governança da plataforma (`gestao_plataforma`) |
| `catalog-api` | **deprecated** | Fallback histórico — não recebe novas entidades |
| `crm-api` | dispatcher | Entidades do CRM + actions compostas (`accept_proposta`, `close_venda`, `save_lead_full`) |
| `whatsapp-api` | webhook | Atendimento WhatsApp+IA do CRM — desacoplada de propósito (não usa JWT de usuário, autentica por secret do canal) |
| `intranet-api` | dispatcher | Entidades da intranet, log de acesso (`gestao_plataforma.logs_acesso`), integração Google Calendar |
| `intranet-notifica-aniversariante` | cron diário | E-mail de aniversário para colaboradores |
| `relatorios-api` | dispatcher | Entidades de relatórios (leitura read-only de `gestao_ativos`) |
| `servicos-api` | monolito de domínio | Financeiro completo: solicitações, aprovação, parcelamento, fornecedores, categorias |
| `servicos-oficina-api` | dispatcher isolado | Checklist de inspeção veicular do módulo Oficina |
| `servicos-lembrete-aprovacoes` | cron horário | Reavisa aprovador de solicitação parada >24h |
| `comunicacao-api` | dispatcher | Entidades do chat interno |
| `push-api` | CRUD genérico | Inscrições Web Push (`public.push_subscriptions`), sem regra de negócio própria |
| `enviar-termo-gmail` | ação pontual síncrona | Envia Termo de Posse assinado via Gmail |
| `processa-fila-email` | cron (worker) | Consome `notificacoes.fila_emails` e envia de fato via Gmail API |
| `security-log-failed-login` | ação pontual | Registra tentativa de login falha (`gestao_plataforma.logs_acesso`) |
| `security-log-login-success` | ação pontual | Registra login bem-sucedido, reseta contador de lockout |
| `security-check-login-lock` | ação pontual | Fallback client-side de verificação de lockout antes do login |
| `security-alerta-picos-login` | cron 15min | Detecta picos de login falho e alerta admins por e-mail |

#### 5.2.1 Por que `servicos` tem duas Edge Functions

`servicos-api` (Financeiro) já tem ~3600 linhas e é deployada como uma
unidade — um erro de sintaxe editando-a derrubaria o Financeiro em produção
junto. Por isso, o módulo Oficina ganhou uma function própria
(`servicos-oficina-api`), e esse é o padrão para os próximos módulos reais do
app (Estoque, Compras, RH): cada um vira sua própria `servicos-<modulo>-api`.
Custo dessa decisão: a lógica de autenticação/autorização foi **copiada**
para `_shared/servicos-auth.ts` em vez de extraída de `servicos-api` — dívida
técnica registrada, as duas cópias podem divergir com o tempo.

### 5.3 `supabase/functions/_shared/` — helpers cross-function

Esses arquivos existem em `_shared/` (em vez de um pacote `@macom/*`) porque
o runtime Deno das Edge Functions não resolve `packages/*` do workspace npm.

| Helper | Papel |
|---|---|
| `auth.ts` | `mapMustChangePassword` + SQL de reset do flag de troca de senha obrigatória |
| `email.ts` | `enqueueEmail` (grava na fila) / `sendGmail` (monta e envia via Gmail API, com/sem anexo PDF) |
| `integracoes.ts` | `loadIntegracaoCredenciais` — lê credenciais do schema `integracoes` (config + Vault) via RPC |
| `avisos.ts` | Avisos de atualização cross-app bloqueantes até aceite |
| `cors.ts` | Lista de origens permitidas (Vercel + domínio próprio) para todas as functions |
| `diasUteis.ts` | Cálculo de feriados e próxima data útil |
| `push.ts` | `sendPushToColaborador` — envio real de Web Push |
| `servicos-auth.ts` | Auth/autorização do sistema Servicos, cópia usada só por `servicos-oficina-api` (ver 5.2.1) |
| `signature.ts` | `updateColaboradorSignature` — grava assinatura digital do colaborador |
| `validation.ts` | Schemas Zod reaproveitados entre functions |

## 6. Fluxos transversais que atravessam múltiplos sistemas

Esta seção é o que mais diferencia este documento dos `CLAUDE.md` por app:
mostra mecanismos que **nenhum app possui sozinho**, implementados uma vez em
schema/helper transversal e consumidos por vários `*-api`.

### 6.1 Acesso a sistema + troca de senha obrigatória

- **Camada 1 (todos os apps):** `public.acessos_usuario_sistema` decide se um
  colaborador pode entrar em determinado sistema (`sistema_id` → `ativo`).
  Alguns apps (`intranet`, `servicos`) empilham uma **Camada 2** própria de
  permissão por módulo em cima disso — modelo específico de cada app, não
  transversal.
- **Troca de senha obrigatória:** `public.colaboradores.precisa_trocar_senha`
  é setado pela `plataforma-api` ao criar/resetar senha. Toda action `me` de
  cada `*-api` retorna `must_change_password` via `mapMustChangePassword`
  (`_shared/auth.ts`), e existe uma action `clear_password_change_required`
  espelhada em cada function, sempre escopada ao colaborador do próprio JWT.
  No front, o `AuthContext` (compartilhado via `@macom/auth` ou local) expõe
  `mustChangePassword`, e o shell de rotas renderiza `PasswordChangeForm`
  (`@macom/ui`) no lugar do conteúdo normal enquanto isso for `true`. Apps
  com `AuthContext` local precisam reimplementar esse gate manualmente — não
  vem de graça como em `central`/`admin`.

### 6.2 Fila de e-mail (`notificacoes.fila_emails`)

Schema transversal sem app dono. Qualquer `*-api` que precise notificar por
e-mail enfileira com `enqueueEmail(sql, { tipo, destinatario, assunto,
bodyText, bodyHtml? })` (`_shared/email.ts`) — nunca monta o `insert` na mão.
O envio de fato acontece de forma assíncrona pelo cron `processa-fila-email`
(a cada minuto, com backoff em erro), que chama `sendGmail` (mesmo módulo
`_shared/email.ts`), usando credenciais lidas de `integracoes.integracoes`
via `_shared/integracoes.ts` (chave `gmail_notificacoes`, configurável na
tela Integrações do Console). A única exceção síncrona é
`enviar-termo-gmail` (Termo de Posse), que chama `sendGmail` diretamente.
Consumidores hoje: `intranet-notifica-aniversariante`,
`security-alerta-picos-login`, `servicos-api` (aprovação/pagamento de
solicitação), `servicos-lembrete-aprovacoes`.

### 6.3 Segurança de login

Quatro functions cooperam sem pertencer a nenhum app específico:
`security-log-failed-login` e `security-log-login-success` gravam em
`gestao_plataforma.logs_acesso`; `security-check-login-lock` é consultado
pelo front antes de tentar logar (fallback client-side de lockout);
`security-alerta-picos-login` roda a cada 15 min e usa a fila de e-mail
(seção 6.2) para alertar admins de picos de falha.

### 6.4 Web Push

`push-api` é um CRUD genérico de inscrições (`public.push_subscriptions`),
sem regra de negócio própria — quem decide **quando** notificar é cada
`*-api` chamando `sendPushToColaborador` (`_shared/push.ts`). No front, o
pacote `@macom/push` fornece o cliente de inscrição. Hoje o único consumidor
real é `servicos` (`PushContext`, `usePushBanner.js`).

### 6.5 Identidade compartilhada do colaborador

Foto de perfil (`foto_url`/`foto_path`) e assinatura digital
(`assinatura_url`/`assinatura_path`) moraram inicialmente em
`gestao_intranet.perfis_colaboradores`, mas foram movidas para
`public.colaboradores` porque são dado de identidade da pessoa, não algo
exclusivo da intranet — qualquer `*-api` que já faça `select * from
public.colaboradores` (todas fazem, no `auth/me`) ganha esses campos de
graça. Consequência: a **captura/edição** continua só na tela de Perfil da
`intranet` (upload de foto, canvas de assinatura); os demais apps (`servicos`
hoje, potencialmente outros no futuro) só **leem** esses campos — ex.:
`AccountMenu` (`@macom/ui`) mostrando a foto no `servicos`, ou
`PositionSignatureModal` (`@macom/pdf-signature`) carimbando a assinatura num
PDF do Financeiro.

### 6.6 Avisos cross-app bloqueantes

`_shared/avisos.ts` + `public.avisos`/`avisos_aceites` implementam um
mecanismo de aviso de atualização que qualquer app pode exibir de forma
bloqueante até o usuário aceitar — não é dado de negócio de nenhum domínio
específico.

## 7. Como rodar e testar

Cada app builda, linta e testa de forma independente — não há pipeline
único para o monorepo inteiro (nem CI configurado; validação é sempre local).

```bash
npm install                 # instala todos os workspaces de uma vez
npm run dev:central         # ou dev:admin, dev:crm, dev:relatorios
npm --prefix apps/intranet run dev
npm run build:<app>         # roda sync:favicons antes do build
```

Cobertura de qualidade automatizada hoje se concentra em dois apps:

```bash
npm run lint          # eslint apps/central/src
npm run test          # vitest (central)
npm run typecheck     # tsc sobre apps/central/jsconfig.json
npm run test:crm:run  # vitest (crm), single run
npm --prefix apps/crm run lint
```

## 8. Mapa de documentação

| Onde ir | Para quê |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) (raiz) | Convenções gerais do monorepo, como criar um app novo, decisão sobre `@macom/auth` vs. `AuthContext` local |
| [`apps/central/CLAUDE.md`](./apps/central/CLAUDE.md) | Módulos, permissões por função (`permissoes_central`), exceção de offboarding |
| [`apps/crm/CLAUDE.md`](./apps/crm/CLAUDE.md) | Modelo de dados completo do CRM (leads, veículos, propostas, vendas), Realtime, WhatsApp+IA |
| [`apps/intranet/CLAUDE.md`](./apps/intranet/CLAUDE.md) | As duas camadas de permissão, buckets de storage, assinatura/foto do colaborador |
| [`apps/relatorios/CLAUDE.md`](./apps/relatorios/CLAUDE.md) | Backend duplo (raiz + `apps/relatorios/supabase/` local), permissão por função + unidade, PWA |
| [`apps/servicos/CLAUDE.md`](./apps/servicos/CLAUDE.md) | Máquina de estados do Financeiro, papéis por módulo, decisão de function separada para Oficina |
| [`EMAIL_NOTIFICACOES_STATUS.md`](./EMAIL_NOTIFICACOES_STATUS.md) | Causa raiz de falhas conhecidas da fila de e-mail e status da generalização entre apps |
| [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md), [`SECURITY_CHECKLIST_20.md`](./SECURITY_CHECKLIST_20.md), [`SECURITY_PENDENTES.md`](./SECURITY_PENDENTES.md) | Auditoria de segurança e pendências |
| [`LGPD_PLANO.md`](./LGPD_PLANO.md) | Plano de adequação LGPD |
| [`SUPABASE_PERFORMANCE_INVESTIGACAO.md`](./SUPABASE_PERFORMANCE_INVESTIGACAO.md) | Investigação de performance do banco |
