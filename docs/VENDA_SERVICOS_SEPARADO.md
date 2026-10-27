# Vender o SERVIÇOS separado do monorepo — mapa de desvinculação

## Context
Hoje `apps/servicos` só funciona dentro do monorepo: usa pacotes `@macom/*`, 2 Edge Functions
(`servicos-api`, `servicos-oficina-api`) com helpers em `_shared/`, e um schema `gestao_servicos`
que tem FKs para tabelas globais (`public.*`) e até lê `gestao_crm`. Vender = entregar um produto
autônomo (front + backend + banco + auth) que não dependa de Central/Admin/CRM/Intranet.
Este documento é só análise (nada foi alterado).

## 1. Front-end — o que copiar
- `apps/servicos/` inteiro (src, public, vite/tailwind/postcss, pwa, components.json).
- Pacotes `@macom/*` realmente usados (contagem de imports):
  - `@macom/ui` (46) → copiar só os componentes usados (button, badge, dialog, table, select,
    sheet, tabs, tooltip, toast/toaster, input, textarea, checkbox, spinner, car-icon, social-icons,
    password-change-form, signature-pad, account-menu, app-footer, app-update-notice, theme*).
  - `@macom/api-client` → apenas `financeiroApi.js` (19), `oficinaApi.js` (13), `supabaseClient.js`
    (8) e `signatureStorage.js` se usado. Os outros (crm/intranet/platform*) ficam de fora.
  - `@macom/validation` (2), `@macom/pdf-signature` (2), `@macom/push` (1).
  - NÃO usa `@macom/auth` (tem AuthContext local) nem `notifications` — bom, menos acoplamento.
- Decisão: transformar em pastas locais (`src/vendor/ui`, `src/lib/api`) ou manter como workspaces
  num mini-monorepo. Recomendado: pastas locais → repo simples, sem workspaces.
- Remover: `prebuild` `../../scripts/syncFavicons.js` (copiar o script ou fixar os favicons),
  `config` do `@macom/config` (se eslint/tailwind vierem de lá, inline os factories).
- Links/textos para "Admin", "CRM", "Relatórios" (≈25+ menções a admin) — revisar: tela de
  Permissões já é interna, mas onde manda o usuário para o Admin (conceder acesso) precisa de
  substituto.

## 2. Backend — Edge Functions
- Copiar `supabase/functions/servicos-api`, `servicos-oficina-api`, `servicos-lembrete-aprovacoes`.
- `_shared/` necessários: `auth.ts`, `cors.ts`, `email.ts`, `avisos.ts`, `diasUteis.ts`, `push.ts`,
  `signature.ts`, `validation.ts`, `servicos-auth.ts`, `formatacao.ts` (+ `whatsapp.ts`/`integracoes.ts`
  se o WhatsApp for mantido).
- Dependências de outras functions: `processa-fila-email` (envio de e-mail), `push-api`,
  `notificacoes-api`/sino, possivelmente `whatsapp-api` → decidir quais entram no pacote vendido.
- Dívida: `servicos-api` ainda tem cópia local da lógica de `servicos-auth.ts` (sem unificar).

## 3. Banco — o ponto mais difícil
- Schema `gestao_servicos`: ~15 tabelas (solicitações/parcelas/anexos/histórico, checklist_*,
  categorias, fornecedores, permissoes_modulo, configuracoes_modulo, notificacoes…). Migrations:
  ~64 arquivos mencionam o schema → consolidar em 1 migration baseline limpa.
- FKs para fora do schema (precisam virar tabelas próprias ou ser mantidas como "núcleo mínimo"):
  `public.colaboradores` (19 FKs, o mais forte), `public.clientes`, `public.veiculos`,
  `public.unidades`, `public.empresas`, `public.departamentos`.
- Tabelas/funções globais usadas: `public.sistemas`, `public.acessos_usuario_sistema` (Camada 1 de
  acesso), `public.push_subscriptions`, `public.avisos`, `notificacoes.fila_emails`,
  funções SQL `servicos_can_access_solicitacao`, `servicos_module_role`,
  `servicos_restringe_visibilidade_dinheiro`, `auto_create_servicos_permissoes` (trigger),
  `has_system_access`, `current_colaborador_id`.
- **Acoplamento escondido com o CRM**: `servicos-oficina-api` lê/escreve `gestao_crm.clientes_crm`,
  `veiculos_estoque`, `propostas`, `vendas` (ex.: impede apagar veículo com proposta/venda e
  cruza clientes). Isso precisa ser cortado ou reimplementado no produto vendido.
- Acoplamento com `gestao_intranet.perfis_colaboradores` (1 ref na servicos-api).
- Storage: buckets de anexos/fotos de checklist/assinaturas — recriar buckets + policies.
- pg_cron: `schedule_servicos_lembrete_aprovacoes` + segredo no Vault (`internal_invoke_secret`).
- RLS policies que chamam funções `public.*` globais.

## 4. Autenticação / identidade
- Hoje: Supabase Auth compartilhado + `public.colaboradores` + `acessos_usuario_sistema` gerenciado
  no app **admin**. No produto vendido não existe Admin → precisa de: cadastro/convite de usuários,
  reset de senha, e tela de acesso (a de Permissões já existe dentro do app).
- Fluxo `precisa_trocar_senha` + `me` / `clear_password_change_required` deve ser mantido.
- Cadastro de `empresas`/`unidades`/`departamentos` hoje vem do Central/Admin → precisa de CRUD próprio.

## 5. Multi-tenancy (decisão de produto, não só de código)
O banco é single-tenant da MACOM. Se for vender para N clientes: (a) uma instância Supabase por
cliente (simples, isolamento total, mais ops) ou (b) coluna `tenant_id` + RLS em todas as tabelas
(escala, mas reescreve muita coisa). Também: branding (logo/favicons/nome "MACOM"), domínio, e-mail
remetente Gmail, WhatsApp provider, Vercel project por cliente.

## 6. Não-técnico
Remover dados/segredos da MACOM (o histórico git já vazou 1 invoke secret — não levar o histórico,
iniciar repo limpo), licença/termos, documentação de instalação, seed de dados iniciais.

## Ordem sugerida (se for executar)
1. Definir modelo de venda (instância por cliente vs. multi-tenant) e escopo (só Financeiro? Oficina?
   os demais módulos são "em breve").
2. Inventariar e cortar a dependência de `gestao_crm` na oficina (maior risco funcional).
3. Desenhar o "núcleo de identidade" mínimo (colaboradores, unidades, empresas, departamentos,
   acesso) que substitui Central/Admin.
4. Criar repo novo, baseline de migration única, copiar functions + `_shared`.
5. Internalizar `ui`/`api-client`/`validation`/`pdf-signature`/`push` no app.
6. Testar do zero: `supabase db reset` + deploy das functions + build do front em projeto Supabase novo.

## Verificação (quando for executar)
- Repo novo builda sem nenhum `@macom/*` de workspace nem path `../../`.
- `grep` por `gestao_crm`, `gestao_intranet`, `gestao_ativos`, `gestao_plataforma` retorna zero.
- Projeto Supabase vazio + migration baseline + seed → login, criar solicitação, aprovar, pagar,
  checklist da oficina e notificações funcionando ponta a ponta.

## Perguntas em aberto para o usuário
- Vender só o Financeiro, ou Financeiro + Oficina (que é o que tem acoplamento com o CRM)?
- Instância por cliente ou multi-tenant?
- O comprador terá um "Admin" próprio ou o cadastro de usuários/empresas vai embutido no app?
