-- Card 3 do Trello (Atendimento): troca os dados mockados de venda do painel lateral
-- (MOCK_VEICULO_ATUAL/MOCK_ULTIMA_COMPRA/MOCK_TICKET_MEDIO/MOCK_SATISFACAO/MOCK_TAGS em
-- ConversaPainelLateral.jsx) por dado real. Veiculo atual/ultima compra/ticket medio ja
-- tinham fonte (gestao_crm.vendas -> veiculos_estoque -> public.veiculos), so faltava uma
-- leitura agregada (ver action get_cliente_resumo_vendas em crm-api/index.ts). Satisfacao
-- (CSAT) e tags nao tinham tabela/coluna nenhuma -- criadas aqui. V1 e so registro manual
-- (sem pesquisa automatizada por WhatsApp/e-mail -- fora de escopo por ora).

alter table gestao_crm.clientes_crm
  add column if not exists tags text[] not null default '{}';

create table if not exists gestao_crm.avaliacoes_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references gestao_crm.clientes_crm(id) on delete cascade,
  nota integer not null check (nota between 1 and 5),
  comentario text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table gestao_crm.avaliacoes_cliente enable row level security;

-- Mesma regra de gestao_crm.clientes_crm (20261022150000_crm_clientes_sem_restricao_posse.sql):
-- sem restricao de posse/unidade -- qualquer colaborador com acesso ao CRM pode ver/registrar
-- avaliacao de qualquer cliente.
drop policy if exists "crm_avaliacoes_cliente_select" on gestao_crm.avaliacoes_cliente;
create policy "crm_avaliacoes_cliente_select"
  on gestao_crm.avaliacoes_cliente
  for select
  to authenticated
  using (public.crm_has_access());

drop policy if exists "crm_avaliacoes_cliente_manage" on gestao_crm.avaliacoes_cliente;
create policy "crm_avaliacoes_cliente_manage"
  on gestao_crm.avaliacoes_cliente
  for all
  to authenticated
  using (public.crm_has_access())
  with check (public.crm_has_access());

grant select, insert, update, delete on gestao_crm.avaliacoes_cliente to authenticated, service_role;

alter table gestao_crm.avaliacoes_cliente replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'avaliacoes_cliente'
  ) then
    alter publication supabase_realtime add table gestao_crm.avaliacoes_cliente;
  end if;
end
$$;

create index if not exists idx_crm_avaliacoes_cliente_cliente_id
  on gestao_crm.avaliacoes_cliente (cliente_id);

notify pgrst, 'reload schema';
