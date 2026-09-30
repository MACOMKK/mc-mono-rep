-- Contatos telefonicos adicionais de um cliente (ex.: WhatsApp, financeiro,
-- frota), alem do telefone principal ja existente em public.clientes.telefone.
-- Deliberadamente NAO mexe em clientes.telefone/telefone_normalizado -- essa
-- coluna continua sendo o telefone principal, unico, e a chave de deduplicacao
-- ja usada hoje (crm-api). Esta tabela e so um complemento: cada numero extra
-- tambem e unico (nao pode pertencer a 2 clientes), mas nao participa do
-- mecanismo de dedup existente sem uma mudanca deliberada no crm-api.

create table public.clientes_telefones_adicionais (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  telefone text not null,
  telefone_normalizado text not null,
  tipo text,
  criado_em timestamptz not null default now()
);

create index idx_clientes_telefones_adicionais_cliente_id
  on public.clientes_telefones_adicionais (cliente_id);

create unique index idx_clientes_telefones_adicionais_normalizado_unique
  on public.clientes_telefones_adicionais (telefone_normalizado);

alter table public.clientes_telefones_adicionais enable row level security;

-- Mesmo nivel de acesso da identidade do cliente (public.clientes), via as
-- funcoes ja criadas em 20260915120000_extract_public_clientes.sql.
create policy "cliente_telefones_adicionais_select" on public.clientes_telefones_adicionais
for select to authenticated using (public.cliente_identidade_has_access());

create policy "cliente_telefones_adicionais_manage" on public.clientes_telefones_adicionais
for all to authenticated
using (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'))
with check (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'));

grant select, insert, update, delete on public.clientes_telefones_adicionais to authenticated, service_role;

notify pgrst, 'reload schema';
