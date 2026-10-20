-- Nivel 0 da auditoria do CRM (2026-10-20): propostas/vendas tem "on delete cascade" em
-- lead_id/cliente_id desde a criacao (20260918100000/20260918110000), contradizendo
-- 20260923120000 ("venda nunca e apagada", soft-cancel). Hoje e possivel apagar um
-- cliente/lead e perder silenciosamente proposta/venda associada via cascade. Troca para
-- "on delete restrict": apagar cliente/lead com proposta/venda vinculada passa a falhar
-- com erro de FK (mapeado para mensagem amigavel em crm-api/index.ts), em vez de apagar
-- em cascata.
--
-- O nome original da constraint nao foi fixado explicitamente na migration que a criou
-- (so "references ... on delete cascade" inline), entao em vez de supor o nome
-- auto-gerado pelo Postgres, o bloco abaixo descobre o nome real via pg_constraint antes
-- de recriar -- robusto independente de como o Postgres nomeou a constraint original.

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  where c.conrelid = 'gestao_crm.propostas'::regclass
    and c.contype = 'f'
    and c.confrelid = 'gestao_crm.leads'::regclass;
  if conname is not null then
    execute format('alter table gestao_crm.propostas drop constraint %I', conname);
  end if;
  alter table gestao_crm.propostas
    add constraint propostas_lead_id_fkey
    foreign key (lead_id) references gestao_crm.leads(id) on delete restrict;
end $$;

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  where c.conrelid = 'gestao_crm.propostas'::regclass
    and c.contype = 'f'
    and c.confrelid = 'gestao_crm.clientes_crm'::regclass;
  if conname is not null then
    execute format('alter table gestao_crm.propostas drop constraint %I', conname);
  end if;
  alter table gestao_crm.propostas
    add constraint propostas_cliente_id_fkey
    foreign key (cliente_id) references gestao_crm.clientes_crm(id) on delete restrict;
end $$;

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  where c.conrelid = 'gestao_crm.vendas'::regclass
    and c.contype = 'f'
    and c.confrelid = 'gestao_crm.leads'::regclass;
  if conname is not null then
    execute format('alter table gestao_crm.vendas drop constraint %I', conname);
  end if;
  alter table gestao_crm.vendas
    add constraint vendas_lead_id_fkey
    foreign key (lead_id) references gestao_crm.leads(id) on delete restrict;
end $$;

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  where c.conrelid = 'gestao_crm.vendas'::regclass
    and c.contype = 'f'
    and c.confrelid = 'gestao_crm.clientes_crm'::regclass;
  if conname is not null then
    execute format('alter table gestao_crm.vendas drop constraint %I', conname);
  end if;
  alter table gestao_crm.vendas
    add constraint vendas_cliente_id_fkey
    foreign key (cliente_id) references gestao_crm.clientes_crm(id) on delete restrict;
end $$;

notify pgrst, 'reload schema';
