# Gap de módulos — o que temos x o que falta

> Registrado em 2026-10-28. Comparação entre os 8 módulos de uma referência de mercado
> (Estoque, CRM, Oficina, Vendas, Pós-venda, Fiscal, Contábil, Financeiro) e o que existe
> hoje no monorepo. Serve de memória para planejar os próximos módulos.

## Temos

| Módulo | Onde | Situação |
|---|---|---|
| CRM | `apps/crm` | Completo: leads, pipelines, clientes, atendimentos, eventos, distribuição, WhatsApp |
| Estoque (veículos) | `apps/crm` (`Estoque.jsx`) | Funcional: status, reserva, situação, catálogos; baixa automática na venda |
| Vendas | `apps/crm` (Propostas/Vendas) | Funcional: proposta, impressão PDF, aceite, venda direta, estorno |
| Financeiro | `apps/servicos` | Só contas a pagar: solicitação, aprovação, pagamento, fornecedores, categorias, calendário, anexo de NF |
| Oficina | `apps/servicos` | Só checklist de inspeção, clientes e histórico de veículos |

## Temos em parte

- **Pós-venda**: apenas marcador `pos_venda` no cliente/atendimento e menu placeholder no CRM.
- **Oficina**: faltam OS, serviços executados, mecânicos, rentabilidade por contrato, controle de peças.
- **Vendas**: faltam comissão de vendedor (débito técnico registrado) e gestão da equipe (metas, ranking).
- **Financeiro**: faltam contas a receber, fluxo de caixa e comissões (planejados no `apps/servicos/CLAUDE.md`).

## Não temos

- **Fiscal**: emissão/gestão de NF-e/NFS-e e organização de arquivos fiscais (XML).
- **Contábil**: nada.
- **Integração de cartões**: conciliação de transações e visão de faturamento.
- **Estoque de peças, pneus e óleos**: módulo Estoque do `servicos` é "em breve", sem backend.
- **Pós-venda automático**: mensagens automáticas e taxa de resposta (WhatsApp existe só para atendimento no CRM).

## Ideia de ordem (a decidir)

Pós-venda e OS da Oficina são os que mais aproveitam a base atual (CRM, clientes/veículos em
`public`, WhatsApp). Fiscal, Contábil e cartões exigem integrações externas novas.
