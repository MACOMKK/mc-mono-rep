-- Rastreabilidade de origem de public.clientes/public.veiculos: hoje nao ha como saber
-- depois de gravado se um registro veio de um lead do CRM, de cadastro manual na Oficina,
-- ou de uma importacao em lote (ex.: scripts/importClientesLote1.mjs). Diferente de
-- gestao_crm.leads.origem_id (origem COMERCIAL/marketing de como o lead chegou), esta
-- coluna e a origem TECNICA: qual fluxo de sistema criou o registro de identidade.
alter table public.clientes
  add column if not exists origem_cadastro text not null default 'desconhecida'
    check (origem_cadastro in ('crm_lead', 'crm_manual', 'servicos_manual', 'importacao_lote', 'desconhecida'));

alter table public.veiculos
  add column if not exists origem_cadastro text not null default 'desconhecida'
    check (origem_cadastro in ('crm_lead', 'crm_manual', 'servicos_manual', 'importacao_lote', 'desconhecida'));

-- Backfill por inferencia (unica informacao indireta disponivel hoje):
-- presenca de extensao comercial em gestao_crm.clientes_crm => veio do CRM (lead ou manual,
-- indistinguivel retroativamente -- fica como 'crm_manual', o mais generico dos dois).
update public.clientes c
set origem_cadastro = 'crm_manual'
where origem_cadastro = 'desconhecida'
  and exists (select 1 from gestao_crm.clientes_crm cc where cc.id = c.id);

-- Lote 1 (LINX Veiculos) foi importado em 2026-10-07 via scripts/importClientesLote1.mjs.
update public.clientes
set origem_cadastro = 'importacao_lote'
where origem_cadastro = 'desconhecida'
  and criado_em::date = '2026-10-07';

update public.veiculos v
set origem_cadastro = c.origem_cadastro
from public.clientes c
where v.cliente_atual_id = c.id
  and v.origem_cadastro = 'desconhecida'
  and c.origem_cadastro <> 'desconhecida';

notify pgrst, 'reload schema';
