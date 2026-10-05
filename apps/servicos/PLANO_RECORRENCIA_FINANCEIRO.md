# Plano: Solicitações recorrentes no Financeiro

> **Status:** ideia aprovada no conceito, **não implementada** (registrada em 2026-10-05).
> Ponto em aberto: confirmar se a próxima passa de novo pela aprovação (recomendado: sim).

## Objetivo
Algumas despesas se repetem todo mês: mensalidades, assinaturas de serviço etc. A solicitação pode ser
marcada como **Recorrente**. Quando ela é **paga**, o sistema gera automaticamente a do mês seguinte,
com os mesmos dados e o **valor em branco**, porque o valor pode mudar de um mês para o outro.

## Abordagem: encadear ocorrências
Cada solicitação paga gera a próxima, ligada à anterior. Assim o ciclo atual continua o mesmo
(`pendente → aprovado → pago`, com parcelas, anexos e histórico). A alternativa seria uma tabela de
"modelos" com um cron mensal, mas isso criaria um conceito e uma tela novos. Além disso, não dispara
no momento do pagamento, que é o gatilho desejado.

## Valor vazio → novo status `rascunho`
Hoje o banco exige `valor numeric not null check (valor > 0)` (migration `20260716090000`) e
`validateCreatePayload` também exige o valor. A aprovação, as parcelas (`validateParcelasSum`) e o
`relatorio_financeiro` dependem dessa regra.

Para permitir o valor vazio, entra um status novo, **`rascunho`**, exibido como "Aguardando valor":
- O valor só pode ficar nulo enquanto a solicitação é rascunho:
  `check (status = 'rascunho' or valor > 0)`.
- Um rascunho não aparece em Aprovações e não entra nos relatórios.
- O solicitante informa o valor e anexa o boleto/NF do mês. Quando ele envia, o rascunho vira
  `pendente` e o aprovador é notificado, igual a uma criação normal.

## Data de vencimento da próxima (decidido)
- A data vem do **vencimento da conta** (`data_vencimento`) mais 1 mês, **nunca da data em que foi
  paga**. O pagamento só dispara a criação.
  - Exemplo: vence 10/11 e é paga em 14/11 → a próxima vence 10/12.
- O cálculo parte sempre do dia original (`recorrencia_dia`), limitado ao último dia do mês: 31 vira 30
  ou 28 em meses curtos. Depois aplica `proximaDataUtil`, que joga para o próximo dia útil. Assim a
  data não escorrega mês a mês.
- Uma solicitação sem vencimento não pode ser marcada como recorrente.

## Mudanças

### Banco (nova migration)
Em `gestao_servicos.solicitacoes_pagamento`:
- `recorrente boolean not null default false`: a tag.
- `recorrencia_origem_id uuid references solicitacoes_pagamento(id)`, com **índice único parcial**.
  Garante no máximo uma "próxima" por solicitação, o que protege do caso de reverter e pagar de novo.
- `recorrencia_dia smallint`: o dia original do vencimento.
- Incluir `rascunho` no check de status e relaxar o check de `valor` (ver acima).

### Backend: `supabase/functions/servicos-api/index.ts`
1. **Helper `gerarProximaRecorrencia(solicitacao, autorId)`**: só age se `recorrente = true` e se ainda
   não existir uma próxima.
   - **Copia:** título, descrição, beneficiário (fornecedor/colaborador + snapshot do nome), categoria,
     forma de pagamento, empresa/unidade/departamento, aprovador de destino, solicitante e `eh_teste`.
   - **Não copia:** valor, anexos, parcelas, NF, pendência e dados de análise.
   - **Grava:** `status = 'rascunho'`, `recorrente = true` e `recorrencia_origem_id` apontando para a
     solicitação paga.
   - **Registra:** `insertHistorico` nas duas solicitações e uma notificação ao solicitante
     ("informe o valor de <título>").
2. **Chamar o helper nos dois pontos em que a solicitação vira `pago`:**
   - `set_status`, ramo `pago` (pagamento à vista);
   - `registrar_pagamento_parcela`, quando a última parcela fecha (bloco `if (solicitacao?.status === 'pago')`).
3. **`create` / `update`:**
   - aceitar `recorrente` em `CREATE_FIELDS`;
   - gravar `recorrencia_dia` a partir do vencimento;
   - bloquear `recorrente` quando não houver vencimento.
4. **Nova action `enviar_rascunho`:**
   - valida o valor com a mesma regra do create;
   - muda o status de `rascunho` para `pendente`;
   - chama `notifyAprovadorNovaSolicitacao`.
5. **`list` / `relatorio_financeiro`:**
   - ignorar rascunhos nas somas e nas filas de aprovação;
   - revisar os usos de `Number(existing.valor)`.

### Como parar a recorrência
Desmarcar "Recorrente" na ocorrência atual ou cancelar o rascunho gerado. Cada ocorrência só gera a
próxima se ela própria estiver marcada como recorrente.

### Frontend (`apps/servicos`)
- No formulário de nova solicitação: checkbox **"Recorrente (mensal)"**, desabilitado quando não há
  vencimento.
- Em `MinhasSolicitacoes.jsx`:
  - selo "Recorrente";
  - status "Aguardando valor" com a ação "Informar valor";
  - filtro "Recorrentes" no `FiltersDrawer`.
- No drawer de detalhe: links para a ocorrência anterior e a próxima, e os eventos novos no histórico.
- Incluir `rascunho` nos mapas de rótulo e cor de status.

## Decisões em aberto
- **A próxima passa de novo pela aprovação?** A recomendação é que sim, porque o valor e o boleto
  mudam. Uma aprovação automática pode vir depois, por flag de configuração, como no suprimento de caixa.
- **Gerar ao pagar ou ao aprovar?** Ficou "ao pagar". Consequência: se o pagamento atrasa, o rascunho do
  mês seguinte também aparece atrasado. A data de vencimento dele não é afetada.

## Verificação (quando implementar)
1. Aplicar a migration e fazer o deploy de `servicos-api`.
2. Criar uma solicitação recorrente com vencimento no dia 31, aprovar e pagar à vista. Conferir que o
   rascunho:
   - vence no fim do mês seguinte, em dia útil;
   - está com o valor vazio e sem anexos;
   - aparece no histórico e gerou notificação.
3. Pagar em 2 parcelas: a próxima só deve nascer depois que a última parcela for paga.
4. Reverter o pagamento e pagar de novo: não pode nascer uma segunda "próxima".
5. Informar o valor no rascunho e enviar: a solicitação deve ir para Aprovações e notificar o aprovador.
6. Conferir que o relatório financeiro não soma rascunhos.
