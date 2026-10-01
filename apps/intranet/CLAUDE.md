# Intranet — app-specific

> Este arquivo complementa o CLAUDE.md raiz do monorepo. Só documenta o que é específico deste app.

## Domínio

Intranet corporativa: avisos, links úteis, colaboradores, documentos, calendário, base de conhecimento e feedback.

## Estrutura

- `src/components/` — por módulo: `announcements`, `auth`, `calendar`, `documents`, `employees`, `knowledge`, `layout`, `links`
- `src/pages/` — telas, incluindo `settings`

## Permissões granulares (duas camadas)

**Camada 1 — Acesso ao sistema** (`public.acessos_usuario_sistema`):
usuário só entra se auth ativo + colaborador ativo + acesso criado + `ativo = true`.
Campo `nivel_acesso`: `admin` (bypassa permissões de módulo) ou `usuario` (sujeito à Camada 2).

**Camada 2 — Permissões por módulo** (`gestao_intranet.permissoes_usuario`):
valores `none | view | edit` por módulo. Default é `view` para quem tem acesso ativo;
`permissoes_usuario` sobrescreve o default.

Essa distinção "acesso ao sistema" (Camada 1) vs "acesso ao módulo" (Camada 2) já está descrita em
detalhe no `apps/intranet/README.md` — este arquivo só resume para referência rápida; o README é a
fonte primária se precisar de mais detalhe (RLS, etc).

Módulos: `mod_avisos`, `mod_links`, `mod_colaboradores`, `mod_documentos`, `mod_calendario`,
`mod_conhecimento`, `mod_feedback`.

**Ao criar uma feature nova em um módulo existente ou um módulo novo, sempre checar/registrar a
permissão correspondente — não assumir que acesso ao sistema implica acesso ao módulo.**

## Backend

- Edge Function: `supabase/functions/intranet-api/index.ts`
  - Entidades: `Announcement`, `AnnouncementComment`, `AnnouncementReaction`, `CalendarEvent`,
    `Document`, `Profile`, `ProfileChangeRequest`, `Employee`, `EmployeeBirthday`, `Feedback`,
    `KnowledgeBase`, `QuickLink`, `UserPermission`, `TrustedIpAccess`
  - Operações padrão: `list`, `filter`, `create`, `update`, `delete`
  - Storage buckets: avisos (2MB), documentos (5MB), avatares
  - Integração com Google Calendar para sincronizar eventos
  - Notificações: usa a estrutura genérica cross-app (ver "Notificação in-app (sino) + Web Push"
    no `CLAUDE.md` raiz), com sistema `intranet`. Os `notify*Audience` decidem quem recebe e
    chamam `createNotifications`, um wrapper fino de `notificar()` de `_shared/notificacoes.ts`,
    em criação, edição e remoção. **Só a criação de aviso e documento** usa `push: true`. O sino
    do `Header.jsx` usa `useNotificacoes` de `@macom/notifications`, que lê pela `notificacoes-api`,
    não pelo `intranet-api`. O usuário ativa o push por dispositivo no dropdown do sino. No acesso
    por IP confiável (`auth_mode === 'trusted_ip'`, sem colaborador) o sino e o push ficam
    desligados. O service worker é próprio (`src/sw.js`, `strategies: 'injectManifest'`) e
    registra os handlers de push via `registerPushHandlers()` de `@macom/push/swHandlers`.
  - `gestao_intranet.notificacoes` foi removida pela migration `20261001130000` (tirada da
    publication `supabase_realtime` e dropada junto com a função de limpeza antiga). O histórico
    antigo do sino foi descartado de propósito, sem cópia para a tabela genérica.
  - Pendências conhecidas das notificações: a audiência (`fetchActiveCollaboratorIds`) é "todos
    os colaboradores ativos", sem filtrar acesso à intranet nem `mod_avisos`/`mod_documentos =
    none`; e um aviso com `publica_em` no futuro notifica na criação, não na data de publicação.
  - Log de acessos: toda chamada `action: 'me'` bem-sucedida grava um registro em
    `gestao_plataforma.logs_acesso` (via `registrarAcessoIntranet`), e `resource: 'accessLogs'`
    (`action: 'list'`, admin-only) lista o histórico paginado — consumido pela seção
    "Log de acessos" em Configurações. Tabela é compartilhada por `sistema_id`
    (`public.sistemas`), pensada para ser reutilizada por outros apps (ex. `relatorios`) sem
    nova migration — só inserir/ler com o `sistema_id` correspondente.
- Schema: `gestao_intranet` (migration `20260514194500_add_gestao_intranet_core.sql`)
  - Tabelas: `perfis_colaboradores`, `avisos`, `comentarios_avisos`, `reacoes_avisos`,
    `eventos_calendario`, `documentos`, `links_uteis`, `base_conhecimento`, `feedback`,
    `permissoes_usuario`
  - `perfis_colaboradores` guarda só o que é genuinamente social/intranet (`bio`, `frase_status`,
    `linkedin_url`, `whatsapp_url`, `localizacao_interna`, `habilidades`, `interesses`,
    `preferencias`, `data_nascimento`). **Foto de perfil não mora mais aqui** — `foto_url`/
    `foto_path` foram movidas para `public.colaboradores` (migration
    `20260831113817_move_foto_colaborador_to_public.sql`), porque é dado de identidade da pessoa
    compartilhado por todos os apps (mesmo nível de `nome`/`email`), não algo exclusivo da
    intranet — outros apps (`servicos`, e futuramente os que adotarem o `AccountMenu` de
    `@macom/ui`) já leem essa coluna sem precisar de join nenhum, porque todos já fazem
    `select * from public.colaboradores` no próprio `auth/me`. Upload/edição continua só na tela
    de Perfil da intranet (`src/pages/Profile.jsx` + `appClient.storage.uploadAvatar`); os demais
    apps só leem.
  - Bucket `avatares`: as policies de storage deixaram de exigir
    `public.has_system_access('intranet')` — qualquer colaborador autenticado dono da pasta
    (`colaboradores/<seu id>/...`) pode ler/gravar, independente do sistema que está acessando
    (mesma migration acima).
  - **Assinatura digital** segue o mesmo raciocínio da foto (dado de identidade compartilhado):
    `assinatura_url`/`assinatura_path` em `public.colaboradores`, bucket próprio `assinaturas`
    (`public: true`, só `image/png`, 512KB) com as mesmas 4 policies de dono de pasta (migration
    `20260831120000_add_assinatura_colaborador.sql`). Criação é feita desenhando num `<canvas>`
    (Pointer Events puros, sem lib externa, mesmo espírito do crop de avatar) em
    `src/pages/Profile.jsx` (`SignaturePadModal`); upload via `appClient.storage.uploadSignature`
    (`src/api/client.js`) e persistência via entidade `ProfileSignature`
    (`updateCurrentSignature` em `intranet-api`). Primeiro consumidor fora da intranet é o
    `servicos` (financeiro), que estampa a assinatura no PDF único gerado em
    `SolicitacaoDrawer.jsx`.

## Convenções

- Novo módulo ⇒ adicionar linha em `permissoes_usuario` (Camada 2) e endpoint/entidade correspondente na `intranet-api`.
- Uploads passam pelos buckets já existentes — respeitar limites de tamanho (2MB avisos / 5MB documentos).
