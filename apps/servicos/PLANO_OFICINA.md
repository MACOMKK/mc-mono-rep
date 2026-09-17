# Módulo Oficina — Checklist Digital de Inspeção de Veículos

> Arquivo temporário para acompanhar a implementação em andamento entre notebooks.
> Apagar depois que os passos 10 e 11 forem concluídos (o que for permanente já
> está documentado em `apps/servicos/CLAUDE.md`).

## Contexto

O app `servicos` tem hoje 6 módulos planejados (Atendimento, Oficina, Financeiro,
Estoque, Compras, RH), mas só Financeiro está implementado — Oficina é um
placeholder `comingSoon` sem backend nem tabelas (`apps/servicos/CLAUDE.md`).

O usuário já validou em outra plataforma (Lovable) um app standalone de
**Checklist Digital de Inspeção de Veículos** (arquivo `estrutura-banco-macom.sql`,
gerado 2026-09-14) e quer trazer essa funcionalidade para dentro do MACOM Central
como **a primeira tela real do módulo Oficina**. O schema do Lovable é isolado
(tabelas `public.funcionarios`, `public.avaliacoes`, `public.avarias`,
`public.checklist_itens`, RLS aberta `anon, authenticated USING (true)`), sem
nenhuma integração com auth, colaboradores ou cadastro de clientes/veículos do
MACOM.

Achado importante da investigação: a plataforma **já foi preparada de propósito**
para este momento. Os comentários das migrations `20260910130000_extract_public_veiculos.sql`
e `20260915120000_extract_public_clientes.sql` citam explicitamente "futuro módulo
Checklist/Oficina do app servicos" como motivo de terem extraído `public.veiculos`
e `public.clientes` para uma camada compartilhada entre CRM e Serviços. Também já
existe `public.colaboradores.assinatura_url/assinatura_path` (assinatura digital
do colaborador, com bucket de storage `assinaturas`), o que torna a tabela
`funcionarios` do Lovable redundante.

Decisões já validadas com o usuário:
1. **Sem tabela `funcionarios` própria** — o responsável pela inspeção é um
   `public.colaboradores`, com um papel novo (`inspetor`) na Camada 2 de
   permissão do módulo `oficina`.
2. **Sem campos de texto livre para cliente/veículo** — `avaliacoes` referencia
   `public.clientes(id)` e `public.veiculos(id)` por FK, com busca/seleção (ou
   criação rápida) desses cadastros na tela, em vez de digitar placa/modelo/cor
   toda vez.
3. **Encaixe no menu**: o checklist é a primeira funcionalidade real dentro do
   item de menu "Oficina" já existente — não vira um módulo/menu separado.

## Abordagem

### 1. Banco de dados (schema `gestao_servicos`, novo(s) migration(s))

Adaptar as 3 tabelas de negócio do Lovable para o padrão do monorepo (schema
`gestao_servicos`, FKs para `public.colaboradores`/`public.clientes`/`public.veiculos`,
RLS via funções `servicos_access_level()`/`servicos_module_role()` já existentes
em vez de `USING (true)`):

- `gestao_servicos.checklist_avaliacoes` — igual a `avaliacoes` do Lovable, mas:
  - `colaborador_id uuid references public.colaboradores(id)` no lugar de
    `funcionario_id`/`responsavel_nome` (nome vem via join).
  - `cliente_id uuid references public.clientes(id)` no lugar de `cliente text`.
  - `veiculo_id uuid references public.veiculos(id)` no lugar de
    `placa/modelo/cor` (km pode continuar como snapshot na avaliação, já que o
    km varia a cada inspeção — não é atributo fixo do veículo).
  - `assinatura_responsavel` **removida** — o PDF/tela final lê
    `public.colaboradores.assinatura_url` do `colaborador_id`, já que o
    colaborador já assina uma vez no perfil (Intranet) e essa assinatura é
    compartilhada entre apps.
  - Mantém: `numero` (sequence), `os` (texto livre por enquanto — não existe
    entidade de Ordem de Serviço ainda; vira FK quando o módulo Oficina ganhar
    OS de verdade), `data`, `observacoes`, `entrega_observacoes`,
    `nivel_combustivel`, `pintura_suja`, `entrega_conferida`, `comunicacoes`
    jsonb, `status` (`em_andamento`/`finalizado`), `data_entrada`, `data_saida`,
    `assinatura_cliente` (capturada ad hoc na hora da inspeção — ver seção
    Frontend), `fotos` jsonb.
- `gestao_servicos.checklist_avarias` — igual ao Lovable, FK para
  `checklist_avaliacoes(id)`.
- `gestao_servicos.checklist_itens` — igual ao Lovable, FK para
  `checklist_avaliacoes(id)`.
- Trigger `set_updated_at` em `checklist_avaliacoes` (reusar
  `public.set_updated_at()`, já usado por `public.veiculos`/`public.clientes`).
- RLS: `select`/`insert`/`update` gated por
  `public.servicos_module_role('oficina')` (papel `inspetor`/`gestor` grava,
  `usuario` só lê) — seguir o padrão de `gestao_servicos.solicitacoes_pagamento`.
- Storage: novo bucket `oficina-checklist-fotos` (fotos do veículo + eventuais
  evidências de avaria), seguindo o padrão de política por pasta usado em
  `20260831120000_add_assinatura_colaborador.sql` (bucket `assinaturas`), mas
  com policy de leitura/escrita condicionada a `servicos_module_role('oficina')`
  em vez de "dono do próprio perfil".

### 2. Permissão — Camada 2 (`gestao_servicos.permissoes_modulo`)

- Alargar o `CHECK` de `permissoes_modulo.papel` (hoje
  `'nenhum','usuario','aprovador','financeiro','contas_a_pagar'`) para incluir
  `'inspetor'` e `'gestor'` (migration no mesmo molde de
  `20260814100000_add_servicos_contas_a_pagar_papel.sql`).
- Estender `public.auto_create_servicos_permissoes()` (hoje só insere a linha
  `financeiro`) para também inserir uma linha `oficina` (papel padrão
  `'nenhum'`) quando o colaborador ganha acesso ao sistema `servicos`.
- `SERVICOS_MODULOS_CONFIG` em `supabase/functions/servicos-api/index.ts`:
  adicionar `oficina: { papeis: ['nenhum', 'usuario', 'inspetor', 'gestor'] }`.
- `apps/servicos/src/lib/modulosPermissao.js`: `oficina.ativo = true` +
  `PAPEIS_MODULO_OFICINA` (nenhum/usuario/inspetor/gestor), mesmo molde de
  `PAPEIS_MODULO_FINANCEIRO`.

### 3. Backend — nova edge function `servicos-oficina-api` (não mexe em `servicos-api`)

**Mudança de decisão em relação à primeira versão deste plano:** em vez de
acrescentar as actions de Oficina dentro de `servicos-api/index.ts` (hoje só
Financeiro, ~3600 linhas, já em produção), Oficina ganha sua **própria** edge
function: `supabase/functions/servicos-oficina-api/index.ts`.

Motivo: `servicos-api` é deployada como uma unidade só — um erro de sintaxe ou
um import quebrado introduzido ao editar esse arquivo derruba a function
inteira, inclusive o Financeiro que já está em produção. Com uma function
separada, um bug em Oficina nunca afeta o deploy do Financeiro (deploys
independentes). Isso também evita que `servicos-api` continue crescendo
indefinidamente conforme os módulos futuros (Estoque, Compras, RH,
Atendimento) forem implementados — cada um ganha sua própria function, do
tamanho do próprio domínio. Este passa a ser o padrão para os próximos módulos
do `servicos` (documentar essa decisão em `apps/servicos/CLAUDE.md`).

**Lógica de auth: copiada para o compartilhado agora, `servicos-api` migra
depois (dívida técnica deliberada).** `servicos-api` hoje tem, no próprio
arquivo, `getAuthenticatedUser`, `getAuthContext` (com cache de 30s),
`getCurrentCollaborator`, `getServicosAccess` (Camada 1) e
`getServicosModuleRole` (Camada 2, com bypass de admin). Criar
**`supabase/functions/_shared/servicos-auth.ts`** com uma **cópia** dessas
funções (não corte/mover) — `servicos-oficina-api` importa desse arquivo
novo desde o início. `servicos-api/index.ts` **não é editado nesta entrega**:
continua com sua cópia local intacta, sem nenhum risco de deploy para o
Financeiro.

Isso deixa, por um tempo, duas cópias da mesma lógica de auth (uma dentro de
`servicos-api`, outra em `servicos-auth.ts`), com risco de divergirem se
alguém corrigir um bug só numa delas. Isso é aceito conscientemente: depois
que Oficina estiver rodando e validada, migrar `servicos-api` para importar
de `servicos-auth.ts` (removendo a cópia local) fica registrado como um
follow-up separado — feito com calma, testado isoladamente, sem competir com
a entrega desta feature. Mesmo padrão de dívida técnica já registrado no
`CLAUDE.md` raiz para a unificação de auth entre apps.

`_shared/cors.ts`, `_shared/auth.ts` e `_shared/email.ts` já são importados
por múltiplas edge functions hoje (prova de que o padrão `_shared/` é seguro
e já usado em produção) — o arquivo novo (`servicos-auth.ts`) deve ficar
separado do `_shared/auth.ts` genérico (esse é usado por
`crm-api`/`intranet-api` também e não tem relação com Camada 1/2 do
`servicos`), para que um eventual bug fique contido só ao `servicos`.

Seguir o dispatcher sequencial já usado (`if (action === ...)`), sem introduzir
o padrão `ENTITY_CONFIG` de outras APIs (convenção do app). Actions novas, todas
em `servicos-oficina-api`:

- `checklist_iniciar` — cria avaliação (cliente_id, veiculo_id, colaborador_id,
  os opcional).
- `checklist_listar` / `checklist_obter` — com filtros (status, colaborador,
  intervalo de data, busca por cliente/placa via join).
- `checklist_atualizar` — campos gerais (km, nível de combustível, pintura
  suja, observações).
- `checklist_finalizar` — status → `finalizado`, `data_saida`,
  `entrega_conferida`, `entrega_observacoes`, `assinatura_cliente`.
- `checklist_itens_upsert` — grava os itens do checklist em lote por categoria.
- `checklist_avaria_adicionar` / `checklist_avaria_remover`.
- `checklist_foto_upload_url` / `checklist_foto_registrar` — mesmo padrão de
  signed upload já usado para `comprovantes-pagamento` no Financeiro.
- `cliente_buscar` / `cliente_criar` e `veiculo_buscar` / `veiculo_criar` —
  operam em `public.clientes`/`public.veiculos` (as funções
  `cliente_identidade_access_level()`/`veiculo_catalogo_access_level()` já
  liberam acesso para o sistema `servicos`, não precisa de migration nova aqui)
  para permitir buscar-ou-criar rápido na tela, sem duplicar cadastro.

`servicos-api` continua dona exclusiva de `me`/`clear_password_change_required`
(gate de troca de senha obrigatória) — é o que o `AuthContext` do frontend já
chama antes de liberar qualquer rota, então `servicos-oficina-api` não precisa
reimplementar isso, só validar o JWT/papel via `servicos-auth.ts`.

`SERVICOS_MODULOS_CONFIG` (usado hoje só por `servicos-api` para validar
`papel` no `set_permissao` de admin) e a tela de Permissões continuam
centralizados em `servicos-api`, já que gestão de permissão é transversal a
todos os módulos, não exclusiva de Oficina — só o dado (`oficina: {...}`)
precisa ser adicionado lá. Essa é a **única** edição em `servicos-api/index.ts`
nesta entrega: acrescentar uma chave num objeto de configuração, sem tocar em
nenhuma lógica de auth/dispatcher existente — risco bem menor do que a
extração de `servicos-auth.ts`, que fica para depois.

### 4. Frontend — `apps/servicos`

- `src/lib/navigation.js`: `oficina.comingSoon = false`, com `children`
  (mesmo molde de Financeiro): `{ key: 'checklists', label: 'Checklists',
  path: '/oficina/checklists' }` (e futuramente outros itens de Oficina).
- `src/App.jsx`: substituir a rota placeholder `/oficina` pelas rotas reais
  (`/oficina/checklists`, `/oficina/checklists/novo`,
  `/oficina/checklists/:id`).
- Novo client `packages/api-client/src/oficinaApi.js` (namespaces:
  `checklists`, `itens`, `avarias`, `fotos`, `clientes`, `veiculos`), no molde
  de `financeiroApi.js`, mas apontando para a function `servicos-oficina-api`
  (URL/invoke diferente de `financeiroApi.js`, que chama `servicos-api`).
- Novas páginas/componentes em `apps/servicos/src/pages/oficina/` e
  `apps/servicos/src/components/oficina/`:
  - Lista de checklists (reusar `Pagination`, `SearchInput`, `FiltersDrawer`
    como padrão, `usePagination` hook).
  - Formulário de checklist (busca/seleção de cliente e veículo com opção de
    criar na hora; itens por categoria; diagrama do veículo para marcar
    avarias — posição `pos_x`/`pos_y` em % sobre uma imagem, como no Lovable).
  - Captura de assinatura do cliente: **replicar o padrão de
    `SignaturePadModal` já implementado em
    `apps/intranet/src/pages/Profile.jsx`** (canvas com pointer capture,
    `toBlob`) — é a única peça sem equivalente compartilhado em `@macom/ui`
    hoje, mas o padrão de captura já existe e deve ser copiado/adaptado, não
    reinventado do zero.
  - Reusar diretamente: `ConfirmDeleteDialog`, `Pagination`, `SearchInput`,
    `CopyButton`, `NotificationsBell`.

## Ordem de execução (passo a passo)

Sequência pensada para nunca deixar nada quebrado no meio do caminho — cada
passo é testável antes de ir pro próximo:

1. ✅ **Migration: tabelas novas** — `gestao_servicos.checklist_avaliacoes`,
   `checklist_avarias`, `checklist_itens` + trigger `set_updated_at` + RLS.
   Não afeta nada existente (schema/tabelas 100% novos).
   (`20260917020000_add_gestao_servicos_oficina_checklist.sql`)
2. ✅ **Migration: permissão** — alargar `CHECK` de `permissoes_modulo.papel`
   (`inspetor`, `gestor`) e estender `auto_create_servicos_permissoes()` pra
   inserir a linha `oficina`. Aditivo, não muda comportamento do Financeiro.
   (`20260917030000_add_servicos_oficina_papel.sql`)
3. ✅ **Storage** — criar bucket `oficina-checklist-fotos` + policies.
   (`20260917040000_add_servicos_oficina_checklist_fotos_storage.sql`)
4. ✅ **`_shared/servicos-auth.ts`** — copiar a lógica de auth de `servicos-api`
   (sem editar o original).
5. ✅ **`servicos-oficina-api`** — nova edge function com o dispatcher e as
   actions de checklist, cliente e veículo, usando o helper do passo 4.
   Testado via curl em produção (checklist_iniciar, checklist_listar,
   cliente_buscar, veiculo_buscar) — OK.
6. ✅ **Edição mínima em `servicos-api`** — só adicionar `oficina: {...}` em
   `SERVICOS_MODULOS_CONFIG`. Smoke test do Financeiro (me + list) rodado em
   produção — sem regressão.
7. ✅ **`apps/servicos/src/lib/modulosPermissao.js`** — ativado `oficina` +
   `PAPEIS_MODULO_OFICINA`.
8. ✅ **`packages/api-client/src/oficinaApi.js`** — client novo apontando pra
   `servicos-oficina-api` + `checklistFotoUpload.js` (upload direto ao storage).
9. ✅ **Frontend: navegação e rotas** — `navigation.js` (Oficina com submenu
   Checklists), `App.jsx` (rota `/oficina/checklists` real), `AuthContext.jsx`
   (papel de Oficina resolvido via `oficinaApi.auth.me`), lista de checklists
   (`pages/oficina/ChecklistList.jsx`) já consumindo dados reais.
   **CHECKPOINT**: parado aqui para o usuário revisar antes de construir as
   telas de formulário/captura (passo 10) — é a parte mais subjetiva/visual.
10. ⬜ **Frontend: telas restantes** — formulário de novo checklist (busca/criação
    de cliente e veículo, itens, avarias) → captura de assinatura → finalizar.
    Construir e testar nessa ordem (lista antes do formulário completo) pra
    validar a integração com o backend incrementalmente.
11. ⬜ **Teste end-to-end manual completo** (ver seção Verificação abaixo).
12. ✅ **Documentar em `apps/servicos/CLAUDE.md`**: (a) decisão de que cada
    módulo novo do `servicos` ganha sua própria edge function
    (`servicos-<modulo>-api`), não entra dentro de `servicos-api`; (b) a
    dívida técnica registrada de `servicos-auth.ts` duplicado (mesmo molde da
    seção de dívida técnica de auth já existente no `CLAUDE.md` raiz).

## Verificação

- Rodar `supabase functions serve servicos-oficina-api` localmente e testar as
  actions novas isoladamente antes de mexer no frontend.
- Depois de editar `SERVICOS_MODULOS_CONFIG` em `servicos-api/index.ts`
  (única mudança nesse arquivo nesta entrega): rodar
  `supabase functions serve servicos-api` e testar um fluxo do Financeiro
  (ex.: listar solicitações, login) como smoke test rápido.
- (Follow-up futuro, fora do escopo desta entrega) quando `servicos-api`
  migrar para importar `servicos-auth.ts` em vez da cópia local: repetir o
  mesmo smoke test do Financeiro antes de considerar concluído.
- Rodar `npm --prefix apps/servicos run dev` e validar manualmente o fluxo:
  login com colaborador papel `inspetor` no módulo oficina → abrir "Oficina >
  Checklists" → criar checklist buscando/criando cliente e veículo → marcar
  itens e avarias → capturar assinatura do cliente → finalizar → conferir que
  aparece na listagem com status `finalizado`.
- Validar que um colaborador com papel `nenhum`/`usuario` no módulo oficina
  não consegue gravar (só ler, se `usuario`), tanto pela UI quanto testando a
  action diretamente (RLS + checagem na edge function).
- Conferir no Supabase Studio que `checklist_avaliacoes.veiculo_id`/`cliente_id`
  realmente apontam para os registros certos de `public.veiculos`/`public.clientes`
  (sem duplicar cadastro a cada novo checklist do mesmo cliente/veículo).
- Não há testes automatizados em `apps/servicos` hoje — validação é manual.
