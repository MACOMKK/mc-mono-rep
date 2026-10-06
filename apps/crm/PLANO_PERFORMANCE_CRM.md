# Correção de performance/usabilidade do CRM

## Contexto

Auditoria de performance/usabilidade no CRM (apps/crm + `supabase/functions/crm-api`) encontrou
6 problemas reais confirmados por leitura de código, nenhum catastrófico isoladamente, mas que
juntos degradam a experiência conforme a base de dados cresce e geram comportamento visualmente
confuso (Kanban "perdendo" leads, chat "piscando" por mensagens de outras conversas, buscas sem
debounce gerando dezenas de requisições). O objetivo é corrigir cada um sem introduzir regressão
— a ordem abaixo minimiza risco (índices aditivos primeiro) e resolve dependências reais entre
os problemas antes de atacar os mais arriscados (Realtime).

## Ordem de execução e dependências

1. **Índices `criado_por`** — zero risco, aditivo, maior alcance (afeta todo vendedor comum).
2. **Separar contagem da paginação no backend** — base técnica para o item 3.
3. **Kanban de Leads buscando o funil inteiro** — depende do item 2 (usa `count: false`).
4. **Estoque com paginação real no servidor** — reaproveita o padrão do item 2; precisa do hook de debounce (item 5a) para ter efeito prático.
5. **Debounce + busca indexável + contadores de Eventos** — independente dos anteriores; o hook de debounce (5a) deve existir antes de tocar em Estoque (item 4).
6. **Realtime com filtro/invalidação escopada** — maior risco de regressão (perder evento é pior que invalidar demais); fica por último, escopo deliberadamente conservador.

---

### 1. Índices em `criado_por`

Nova migration `supabase/migrations/<timestamp>_add_crm_criado_por_indexes.sql`:
```sql
create index if not exists idx_crm_leads_criado_por on gestao_crm.leads (criado_por);
create index if not exists idx_crm_clientes_crm_criado_por on gestao_crm.clientes_crm (criado_por);
```
`access-scope.ts:142-164` usa `(responsavel_id = $1 or criado_por = $1)` para nível `usuario` — sem
índice em `criado_por`, o `OR` não forma `BitmapOr` eficiente e cai pra seq scan. Sem `CONCURRENTLY`
(nenhuma migration do repo usa; roda dentro de transação do runner do Supabase CLI, consistente
com o padrão existente).

**Teste:** `EXPLAIN ANALYZE` do SELECT de `list` em `leads`/`clientes` para um colaborador nível
`usuario`, antes/depois — confirmar `Bitmap Index Scan` em vez de `Seq Scan`.

### 2. Separar contagem do SELECT paginado (`supabase/functions/crm-api/index.ts`)

Hoje (`buildListSelect`, linha ~877; bloco `action === 'list'`, linhas ~2024-2077) todo `list` usa
`count(*) over()`, forçando o Postgres a computar o `WindowAgg` — incluindo a subquery LATERAL de
`veiculos_interesse` (linhas 894-907) e os LEFT JOINs — sobre **todas** as linhas que casam no
`WHERE`, não só a página.

**Abordagem:** trocar por duas queries em `Promise.all`:
- Query A (como hoje, sem `count(*) over()`): mesma `FROM`/`JOIN` com a lateral, `ORDER BY`/`LIMIT`/`OFFSET`.
- Query B (nova, leve): `select count(*) from <FROM/JOIN mínimo necessário para o WHERE> where <mesmo WHERE>` — **sem** a lateral de `veiculos_interesse` (nunca referenciada em filtro), mantendo só os joins que o `WHERE` de fato usa (ex.: `r`/`o` quando `buildSearchFilter` faz `pushText('r.nome')`/`pushText('o.nome')`; `cd` quando `filters.sla_status` está ativo).
- Reusar a mesma montagem de `clauses`/`queryValues` para as duas queries (nunca duplicar a lógica de WHERE) — escrever `buildCountFrom(entity)` ao lado de `buildListSelect`, comentando quais joins são necessários e por quê.
- Adicionar parâmetro opcional `body.count` (default `true`); quando `false`, pula a Query B e devolve `count: null` — é o gancho que o item 3 (Kanban) vai usar para não pagar contagem num fetch em massa.
- Resposta (`{ rows, count, page, pageSize, offset }`) permanece idêntica quando `count` não é passado — zero mudança exigida no frontend para este item isoladamente.

**Risco principal:** o WHERE da Query B precisa ser **idêntico** ao da Query A; esquecer um join
necessário (ex. `cd` do filtro de SLA) quebraria o `count` silenciosamente.

**Teste:** comparar `count` antes/depois para os mesmos filtros em `leads`/`clientes`/`atendimentos`/
`veiculos_estoque`, com atenção especial a filtro `sla_status` e busca por nome de responsável/origem
(dependem de joins extras). `EXPLAIN ANALYZE` comparando plano antes (`WindowAgg`) vs. depois.

### 3. Kanban de Leads buscando o funil inteiro

`apps/crm/src/pages/Leads.jsx` (linhas 99, 126-147) hoje reusa a página de 50 itens da tabela
(`orderBy: '-created_date'`) no Kanban — leads antigos em etapas avançadas podem não aparecer,
sem aviso.

**Abordagem:**
- Quando `kanbanAtivo` for `true`, disparar query dedicada (`['leads-kanban', { filters, busca: buscaDebounced }]`) chamando `listPage({ limit: 501, filters, search: buscaDebounced, orderBy: '-created_date', count: false })` — usa o `count: false` do item 2.
- Técnica "fetch N+1": pedir 501; se vierem 501, há mais que o cap de 500 — cortar a 501ª e exibir banner "Mostrando 500 de X+ leads ativos — refine os filtros para ver todos" (novo padrão no app, simples: texto + ícone).
- Passar esse array pra `LeadsKanban` no lugar de `leadsPage.rows`. **Não tocar na tabela** (`viewMode === 'table'` continua com a paginação de 50 de sempre).
- Verificar/plumbar o parâmetro `count: false` por toda a cadeia até a Edge Function (`crmDataClient.js` → client HTTP que monta o body) sem quebrar chamadas existentes que não o enviam (default do backend continua `true`).
- Medir tempo real do fetch de 500 linhas (com a lateral de veículo, usada no card) antes de fixar o cap — pode precisar ajustar para 300 ou 800.

**Teste:** criar >500 leads ativos em etapas variadas incluindo leads antigos em etapas avançadas,
confirmar que aparecem no Kanban; confirmar banner de truncamento aparece/desaparece corretamente
ao filtrar; confirmar tabela não muda de comportamento.

### 4. Estoque com paginação real no servidor

`apps/crm/src/pages/Estoque.jsx` (linhas 139-230) usa `VeiculoEstoque.list('-created_date')` —
limit fixo 100 (`crmDataClient.js` `createListRepository.list`, linha 742), filtro 100% client-side.

**Abordagem:**
- Trocar para `VeiculoEstoque.listPage({ orderBy: '-created_date', page, limit: pageSize, filters, search: buscaDebounced })` — mesmo padrão já usado em `Leads`/`Clientes`. `createListRepository` já expõe `listPage` para qualquer entidade.
- Migrar filtros client-side pro servidor: `condicao`/`status`/`situacao` já são `allowedFields` com suporte em `buildSqlFilters`; `chassi`/`placa` já cobertos por `buildSearchFilter` — só mudar de filtro local pro campo `search`.
- `marca`/`modelo` exigem mudança real: adicionar `left join gestao_crm.modelos_veiculo mv on mv.id = v.modelo_id` e `left join gestao_crm.marcas_veiculo mk on mk.id = mv.marca_id` em `buildListSelect('veiculos_estoque')`, e estender `buildSearchFilter` (branch `veiculos_estoque`) com `pushText('mv.nome')`/`pushText('mk.nome')`.
- Adicionar debounce (hook do item 5a) ao campo de busca principal — sem isso, mover a busca pro servidor sem debounce dispara 1 request por tecla (pior que hoje, que é só filtro JS local).
- Adicionar `ListPagination` (componente já usado em Leads/Clientes/Eventos).
- **Antes de codar**: ler o restante de `Estoque.jsx` (não só as primeiras ~230 linhas) pra mapear todo uso de `veiculos`/`veiculosFiltrados` que assuma lista completa em memória (ex.: validação de duplicidade de chassi/placa no formulário, contagem de resumo) — esses pontos precisam de query dedicada em vez de depender da lista paginada.

**Teste:** cadastrar >100 veículos, confirmar paginação cobre todos; comparar resultado de cada
filtro (servidor novo vs. client-side antigo) no mesmo dataset; confirmar que `ClienteReservaField`
(fluxo de reserva, debounce próprio) continua funcionando sem interferência.

### 5. Debounce + busca indexável + contadores de Eventos

**5a — Hook de debounce reutilizável.** Novo `apps/crm/src/hooks/useDebouncedValue.js`, extraindo
a implementação já existente em `Estoque.jsx:73-80`:
```js
export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}
```
Aplicar em `Leads.jsx` (substitui `useEffect`/`setTimeout` manual das linhas 89-120, comportamento
idêntico), `Clientes.jsx` (busca direto na queryKey hoje, sem debounce), `Eventos.jsx` (idem, e
precisa propagar pro `['eventos-contadores']` também), `Estoque.jsx` (busca principal, item 4).
Cuidado: o `useEffect` que reseta `page` para 1 precisa depender do valor **debounced**, não do raw.

**5b — `pg_trgm` + GIN nas colunas de busca.** Nova migration. `buildSearchFilter` sempre monta
`ILIKE '%termo%'` — índices B-tree existentes só ajudam prefixo, nunca "contém". Habilitar
`pg_trgm` e criar GIN trigram em: `gestao_crm.leads(lower(nome))`, `gestao_crm.leads(lower(modelo_interesse))`,
`public.clientes(lower(nome))`, `public.clientes(cpf_cnpj)`, `gestao_crm.veiculos_interesse(lower(marca))`,
`gestao_crm.veiculos_interesse(lower(modelo))`, `public.veiculos(lower(chassi))`, `public.veiculos(lower(placa))`.
Não criar para `telefone` (já usa índice de igualdade + busca por dígitos, ganho menor) nem para
tabelas pequenas (`origens_lead`, `colaboradores`). Atenção: `create extension` precisa de permissão
no pipeline de deploy (mesmo precedente de `pg_net`/`pg_cron`); GIN trigram tem custo de escrita
maior — medir impacto em `INSERT`/`UPDATE` de `leads` (coluna de alta escrita) antes de generalizar.

**5c — Consolidar contadores de Eventos.** `Eventos.jsx` (linhas 35-42, 96-115) dispara 6 chamadas
de rede via `Promise.all` (`countAtividades` por status + por janela de agenda) a cada busca/filtro.
Criar action nova na Edge Function (`list_atividades_contadores`) que aplica o mesmo `access-scope`
uma única vez e devolve tudo via `GROUP BY status` + `count(*) filter (where ...)` pras janelas de
agenda, num único roundtrip.

**Teste (5a):** digitar rápido em cada uma das 4 telas, confirmar só 1 request ~300ms após parar.
**Teste (5b):** `EXPLAIN ANALYZE` antes/depois da busca, confirmar `Bitmap Heap Scan` via GIN em vez
de `Seq Scan`. **Teste (5c):** comparar os 6 números produzidos hoje com os da action nova, para o
mesmo conjunto de filtros, em dados cobrindo todas as combinações de status/janela.

### 6. Realtime com filtro/invalidação escopada

`apps/crm/src/hooks/useCrmRealtime.js` não usa `filter` em nenhuma subscription (linhas 335-352) e
invalida por prefixo de queryKey sem checar relevância (linhas 282-306). Escopo deliberadamente
conservador — só mexer onde é possível replicar a regra de acesso **exatamente**, sem risco de
perder evento legítimo (fail-open sempre que houver dúvida).

**6a — Filtro de subscription só em `leads`.** `access-scope.ts:142-164`: nível `usuario` é
`(responsavel_id = x OR criado_por = x)` — duas colunas diretas da própria tabela, replicável com
**duas subscriptions** (mesmo canal), seguindo o padrão já usado em `packages/notifications/src/useNotificacoes.js:54`:
```js
// usuario comum
channel.on('postgres_changes', { event: '*', schema: 'gestao_crm', table: 'leads', filter: `responsavel_id=eq.${collaboratorId}` }, handler);
channel.on('postgres_changes', { event: '*', schema: 'gestao_crm', table: 'leads', filter: `criado_por=eq.${collaboratorId}` }, handler);
// gestor
channel.on('postgres_changes', { event: '*', schema: 'gestao_crm', table: 'leads', filter: `unidade_id=eq.${unitId}` }, handler);
// admin: sem filter, como hoje
```
**Não estender a `atendimentos`/`clientes`/`conversas_atendimento`/`mensagens_atendimento`** — a
regra de acesso dessas usa `EXISTS`/join (não é coluna direta), e um filtro de subscription só vê a
linha crua sem join; filtrar errado perderia eventos legítimos. Documentar como limitação conhecida.

**6b — `mensagens_atendimento`: invalidação exata por `conversa_id`.** Em vez de invalidar
`['mensagens-atendimento']`/`['conversas-atendimento']` por prefixo (linha ~82-83, já comentado no
código como problema conhecido), extrair `payload.new?.conversa_id ?? payload.old?.conversa_id` e
chamar `invalidateQueries({ queryKey: ['mensagens-atendimento', conversaId], exact: true })` — só a
conversa afetada revalida, não qualquer conversa aberta no momento.

**6c — INSERT de leads: invalidar só queries compatíveis.** Antes de invalidar `['leads']` por
prefixo (linha ~305), usar `queryClient.getQueryCache().findAll({ queryKey: ['leads'] })`, comparar
o `filters` de cada entrada (guardado na própria queryKey) contra os campos do `nextItem`
(`empresa`, `unidade_id`, `responsavel_id`, `origem_id`), e só invalidar as compatíveis. Ignorar o
campo `busca` na comparação (sempre invalida se houver busca ativa — fail-open). Em caso de dúvida/
campo ausente, sempre invalidar (nunca fail-closed).

**Teste:** logar como `usuario` A e B, criar/atualizar lead de B com A observando — A não deve
receber/revalidar; criar/atualizar lead de A — deve revalidar. Mesma checagem por unidade para
`gestor`. `admin` deve continuar recebendo tudo (comportamento idêntico ao atual — é o nível que
cobre a maior superfície de teste manual). Abrir duas conversas, mandar mensagem numa — só essa
revalida. Rodar fluxo ponta a ponta (lead/atendimento/cliente/conversa/mensagem) como `admin` pra
garantir que nada parou de atualizar em tempo real.

## Fora de escopo

- Paginação por coluna/lazy-load no Kanban (reescrita grande de `LeadsKanban.jsx`, só se justificaria com funil ordens de grandeza maior que o cap de 500).
- Filtro de subscription Realtime em `atendimentos`/`clientes`/conversas (exigiria denormalizar `unidade_id`/`responsavel_id` em `atendimentos` — mudança de schema maior).
- Modo de contagem aproximada ("mais de 100 resultados") — muda contrato de `ListPagination.jsx`, fica como evolução futura se o volume crescer muito mais.
- Envio de e-mail transacional do CRM (gap funcional identificado na auditoria, não é problema de performance).

## Arquivos críticos

- `supabase/functions/crm-api/index.ts` — itens 2, 4 (joins/filtros de `veiculos_estoque`), 5b (busca)
- `supabase/functions/crm-api/access-scope.ts` — referência exata pro filtro de Realtime do item 6a
- `apps/crm/src/pages/Leads.jsx` — item 3 (Kanban) e origem do hook de debounce (5a)
- `apps/crm/src/pages/Estoque.jsx` — item 4
- `apps/crm/src/pages/Eventos.jsx` — itens 5a e 5c
- `apps/crm/src/hooks/useCrmRealtime.js` — item 6
- novas migrations em `supabase/migrations/` — itens 1 e 5b
