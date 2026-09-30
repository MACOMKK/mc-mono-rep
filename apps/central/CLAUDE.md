# Central — app-specific

> Este arquivo complementa o CLAUDE.md raiz do monorepo. Só documenta o que é específico deste app.

## Papel

Shell de autenticação/sessão da plataforma: cadastro de ativos/infraestrutura, colaboradores,
departamentos, cargos, unidades, contratos/documentos e termos de posse. Gestão de sistemas,
permissões globais e auditoria administrativa são responsabilidade do Console (`apps/admin`) —
ver `CLAUDE.md` raiz. É o único app com testes (Vitest) e lint dedicado no monorepo.

**Exceção intencional:** o offboarding de colaborador (`CatalogManager.jsx`, ação "desvincular
todos os vínculos") aciona `admin-create-user` (`unlink_assignments`), que apaga as linhas de
`public.acessos_usuario_sistema` do colaborador diretamente — não passa pelo Console/`plataforma-api`.
É proposital: a limpeza de acesso é parte do ciclo de vida do colaborador no Central, não gestão de
acesso avulsa. Não tratar isso como pendência de migração para o Console.

## Estrutura

- `pages/` — 12 módulos: Assets, Collaborators, Contacts, ContractsDocuments,
  CorporateLines, Departments, Infrastructure, TermsPossession, Units, Dashboard, Positions,
  CatalogManager
- `pages/catalog-manager/` — módulo isolado com components/hooks/config/utils próprios (mais
  complexo que os demais; tem testes dedicados)
- `lib/centralPermissions` — regras de permissão por módulo
- `lib/AuthContext` — contexto de auth (testado em `test/auth-context.test.jsx`)

## Backend

- Edge Function: `central-api` — expõe ~20 entidades (departamentos, cargos, unidades,
  colaboradores, contatos, ativos, infra_estrutura, linhas_corporativas, contratos_documentos,
  termos_posse, fila_emails)
- Schema: `gestao_ativos` — tabelas: `ativos`, `infra_estrutura`, `linhas_corporativas`,
  `termos_posse`, `contatos`, `contatos_documentos`, `permissoes_central`. `fila_emails` **não** é mais deste
  schema — vive em `notificacoes.fila_emails` (schema transversal, ver CLAUDE.md raiz, seção
  "Notificação por e-mail"); `central-api` só expõe essa tabela para listagem administrativa.
- A tabela `logs_auditoria` continua sendo escrita pela `central-api` (trilha das ações do
  próprio app), mas não tem mais página de consulta no Central — a leitura de auditoria é
  centralizada no Console (`apps/admin`, `AuditOverview.jsx`).

## Permissões

`gestao_ativos.permissoes_central` define acesso por `funcao + modulo`. Diferente do padrão de
Intranet (que é por usuário) — aqui a permissão é atrelada ao cargo/função do colaborador, não à
conta individual. O front consulta/aplica essas regras via `lib/centralPermissions`; o back
(Edge Function `central-api`) valida contra a tabela `permissoes_central` — os dois precisam ficar
em sincronia. Ao adicionar um módulo novo em `pages/`, registrar a entrada correspondente nos dois
lugares.

## Testes

Este é o único app com `npm run test` / `npm run lint` / `npm run typecheck` configurados no
`package.json` raiz. Ao alterar `AuthContext` ou lógica de permissões, rodar os testes antes de
subir — não há CI para pegar regressões automaticamente.

## Convenções

- Mudanças no `catalog-manager` devem manter os testes locais do módulo passando.
- Novas entidades administrativas seguem o padrão CRUD já usado pela `central-api`, evitando
  endpoints ad-hoc.
