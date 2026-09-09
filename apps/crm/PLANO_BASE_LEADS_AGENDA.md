# Base do CRM de Veículos — Estrutura ideal para Leads e Agenda (Carro + Moto)

## Contexto

O REVVO CRM hoje atende concessionárias que vendem carro e/ou moto, mas o schema
trata "categoria de veículo" como um detalhe opcional e cosmético: `veiculos_interesse`
guarda marca/modelo como texto livre, `categoria_veiculo_id` é opcional e nada no
sistema (distribuição, SLA, formulário, relatórios) realmente diferencia o fluxo
de carro do de moto. Isso já causou retrabalho recente (ex.: migração de
`leads.origem` texto→catálogo em `20260909110000_add_crm_origens_lead.sql`) e vai
se repetir se a base de veículo continuar solta.

Antes de avançar em novos módulos (Estoque, Funil configurável, Atendimento
WhatsApp), o pedido é consolidar a fundação de **Leads** e **Agenda de
Atividades** de um jeito genérico o suficiente para qualquer empresa de
veículos (carro, moto, ou ambos) usar sem gambiarra — sem, no entanto,
reescrever o motor de funil que já funciona (`atendimentos` como fonte única de
agenda + interação, decisão confirmada: manter unificado).

Este plano é o **desenho arquitetural** dessa base. A implementação (migrations,
`crm-api`, frontend) será feita depois, em fases, cada uma validada
separadamente.

## Decisões já tomadas (com o usuário)

1. Catálogo de veículo estruturado (Marca → Modelo), não mais texto livre puro.
2. Modelo de agenda continua **unificado** em `atendimentos` (atividade
   planejada + resultado na mesma linha) — não separar em duas entidades.
3. A base deve **já prever** atributos específicos por segmento (ex.: moto tem
   cilindrada, carro tem nº de portas/tipo de câmbio), não deixar para depois.

## Estado atual (referência)

- `leads`: cliente_id, origem_id (FK `origens_lead`), status (funil fixo de 7
  estados via `check`), responsável/SLA geridos por trigger
  (`prepare_lead_phase1`), `modelo_interesse` texto legado.
- `veiculos_interesse`: 1+ registros por lead (`principal` flag), marca/modelo/
  versão em texto livre, `categoria_veiculo_id` opcional (FK `categorias_veiculo`,
  hoje só "Moto"/"Carro" cadastrados livremente).
- `atendimentos`: única tabela para agenda (`status planejada/concluida/cancelada`,
  `proximo_contato`) e para o registro de interação (`resultado`), com triggers
  que propagam o resultado para o status do lead. `tipo_atendimento` tem um
  `check` com 9 valores, dos quais 4 são legado não usados na UI atual.
- Nenhuma tabela tem noção de "segmento" além do texto em `categorias_veiculo`.

## Estrutura proposta

### 1. Segmento de veículo como catálogo central (`categorias_veiculo` → papel de "segmento")

Manter a tabela `categorias_veiculo` (não renomear — evita churn desnecessário),
mas formalizar seu papel: é o catálogo de **segmento** (Carro, Moto, e
extensível a Caminhão/Utilitário/etc. por empresa), e passa a carregar a
definição dos atributos específicos daquele segmento:

- Nova coluna `campos_extra jsonb default '[]'` em `categorias_veiculo`: lista
  configurável de campos específicos do segmento, cada item com
  `{ chave, label, tipo (texto|numero|opcao), opcoes? }`. Ex.: para "Moto" →
  `[{chave: "cilindrada", label: "Cilindrada (cc)", tipo: "numero"}]`; para
  "Carro" → `[{chave: "num_portas", label: "Nº de portas", tipo: "opcao", opcoes: ["2","4"]}, {chave: "tipo_cambio", label: "Câmbio", tipo: "opcao", opcoes: ["Manual","Automático","CVT"]}]`.
- Isso resolve "prever campos por segmento" sem exigir migration nova toda vez
  que uma empresa quiser um atributo diferente — o admin cadastra pela própria
  tela de Categorias de Veículo (`CategoriasVeiculo.jsx`, já existe, só ganha
  um editor de `campos_extra`).
- `categoria_veiculo_id` em `veiculos_interesse` passa a ser **obrigatório**
  (`NOT NULL`) — hoje é opcional e isso é a raiz da falta de diferenciação
  carro/moto no restante do sistema.

### 2. Catálogo de Marca e Modelo

Duas tabelas novas em `gestao_crm`, seguindo o mesmo padrão de
`origens_lead`/`categorias_veiculo` (cadastro livre, `ativo` boolean, RLS
admin/gestor para escrever):

- `marcas_veiculo` (`id`, `nome` unique, `ativo`) — marca é independente de
  segmento (ex.: Honda vende carro e moto).
- `modelos_veiculo` (`id`, `marca_id` FK `marcas_veiculo`, `categoria_veiculo_id`
  FK `categorias_veiculo`, `nome`, `ativo`) — o **modelo** é quem amarra ao
  segmento (Honda Civic = Carro, Honda CG = Moto), permitindo popular o select
  de modelos filtrado por segmento + marca escolhidos.

Em `veiculos_interesse`, substituir os campos texto `marca`/`modelo` por
`marca_id`/`modelo_id` (FK, nullable) **mantendo** `marca_outro`/`modelo_outro`
(texto, nullable) como fallback para veículo ainda não cadastrado no catálogo —
padrão comum em CRMs para não travar o vendedor num catálogo incompleto.
`versao`, `ano`, `condicao`, `faixa_preco_min/max`, `cor_preferida` continuam
como estão (atributos comuns a qualquer segmento). `combustivel`/`cambio`
(hoje colunas fixas texto livre) ficam mantidos como estão — são comuns o
suficiente a carro/moto para não valer a pena mover para `campos_extra` agora.

Nova coluna `atributos jsonb default '{}'` em `veiculos_interesse` para guardar
os valores dos `campos_extra` definidos pelo segmento (ex.:
`{"cilindrada": 160}`), sem exigir schema change por atributo.

### 3. Lead ↔ Veículo de interesse

Sem mudança estrutural — o modelo atual (1 lead → N `veiculos_interesse`, com
flag `principal`) já é adequado e cobre bem "cliente interessado em mais de um
veículo". Só documentar isso explicitamente no `CLAUDE.md` do app, já que hoje
o `LeadForm.jsx` só edita o veículo principal.

### 4. Agenda de Atividades (`atendimentos`) — consolidar, não redesenhar

Mantendo o modelo unificado (decisão do usuário), a fundação fica mais sólida
com uma limpeza:

- Reduzir o `check` de `tipo_atendimento` aos 5 valores realmente usados hoje
  (`ligacao, whatsapp, email, visita, test_drive`), removendo os 4 legados
  (`venda, pos_venda, agendamento, retorno`) que não aparecem em nenhuma UI.
  Isso evita que dado morto do schema antigo confunda quem for estender o
  fluxo depois.
- Documentar formalmente no `CLAUDE.md` do CRM que `atendimentos` é a
  **única** fonte da Agenda de Atividades (não existe tabela `eventos`), e que
  a entidade lógica `Atividade` no frontend é um alias dela — isso hoje só
  vive implícito no código (`crmDataClient.js`), não está registrado como
  decisão arquitetural.
- Nenhuma mudança de campo é necessária para diferenciar carro/moto na agenda:
  a atividade já é vinculada ao lead, que por sua vez está vinculado ao
  veículo de interesse com segmento definido — a agenda herda o contexto sem
  precisar duplicar campo de segmento nela.

### 5. Fora de escopo deste plano (registrar como próximos passos naturais)

- Funil de status configurável por empresa (`leads.status` continua com
  `check` fixo de 7 estados) — já existe item "Funil"/"Etapas do Funil" como
  `comingSoon` no Navbar; tocar nisso é um projeto à parte.
- Estoque de veículos reais (o catálogo marca/modelo aqui é só "interesse do
  lead", não inventário) — módulo `Estoque` já está marcado `comingSoon`.
- Estrutura de sub-tipo dentro do segmento (ex.: SUV/Hatch/Sedan dentro de
  Carro) — pode nascer depois como outro `campos_extra` ou catálogo próprio,
  não é bloqueio para a base de leads/agenda.

## Arquivos/áreas que a implementação (fases futuras) vai tocar

- `supabase/migrations/` — novas migrations para `campos_extra` em
  `categorias_veiculo`, tabelas `marcas_veiculo`/`modelos_veiculo`, colunas
  `marca_id/modelo_id/marca_outro/modelo_outro/atributos` em
  `veiculos_interesse`, `NOT NULL` em `categoria_veiculo_id`, simplificação do
  `check` de `tipo_atendimento`.
- `supabase/functions/crm-api/index.ts` — `ENTITY_CONFIG` ganha `marcas_veiculo`
  e `modelos_veiculo`; `allowedFields` de `veiculos_interesse` atualizado;
  `mapDatabaseError` ganha mensagens para as novas constraints.
- `apps/crm/src/pages/CategoriasVeiculo.jsx` — editor de `campos_extra`.
- Novas páginas de configuração `MarcasVeiculo.jsx` / `ModelosVeiculo.jsx`
  (mesmo padrão de `OrigensLead.jsx`), com entrada no Navbar em
  "Configurações".
- `apps/crm/src/components/leads/LeadForm.jsx` — step "Veículo" passa a usar
  selects dependentes (Segmento → Marca → Modelo) + renderização dinâmica dos
  `campos_extra` do segmento escolhido, com fallback para texto livre
  ("Não encontrei o modelo").
- `apps/crm/CLAUDE.md` — documentar o papel de `categorias_veiculo` como
  segmento configurável, o novo catálogo marca/modelo, e formalizar
  `atendimentos` como única fonte da Agenda de Atividades.

## Verificação (quando a implementação começar)

- Migration aplicada localmente (`supabase db push`) sem quebrar leads
  existentes (backfill: veículos com `categoria_veiculo_id` nulo precisam de
  uma migração de dados antes do `NOT NULL`, ex.: default para uma categoria
  "Não informado" ou exigir preenchimento manual antes do deploy).
- `crm-api` respondendo `list`/`create` para `marcas_veiculo`/`modelos_veiculo`.
- `LeadForm.jsx`: criar lead de moto e de carro manualmente na UI, conferindo
  que os `campos_extra` corretos aparecem por segmento e que o fallback
  "outro modelo" funciona.
- Testes existentes do CRM (`npm run test:crm:run`) continuam passando após
  ajuste de fixtures/mocks que referenciam `veiculos_interesse`.
