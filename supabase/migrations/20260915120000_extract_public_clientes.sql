-- Extrai a identidade da pessoa (nome/telefone/email) de gestao_crm.clientes para
-- uma entidade central em public.clientes, reaproveitavel por outros apps (ex.:
-- futuro modulo Checklist/Oficina do app servicos) sem duplicar cadastro -- mesmo
-- padrao ja usado para public.veiculos / gestao_crm.veiculos_estoque.
-- gestao_crm.clientes e renomeada para gestao_crm.clientes_crm e passa a ser so
-- a extensao comercial (empresa/status_relacionamento/observacoes) ligada 1:1
-- pelo mesmo id (nao um id novo, porque leads/atendimentos/historico_atendimentos
-- ja referenciam esse id e nao podem ser reapontados). O nome com sufixo "_crm"
-- deixa explicito que e a extensao, no mesmo molde de veiculos_estoque -- manter
-- o nome "clientes" nos dois schemas causava confusao sobre qual e a identidade
-- (public.clientes) e qual e a extensao.
--
-- Dados do CRM hoje sao de teste -- migracao feita com insert+drop, nao com
-- ALTER TABLE ... SET SCHEMA (que so serve para mover a tabela inteira, nao para
-- separar colunas de uma tabela em duas).

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  telefone_normalizado text not null,
  email text,
  email_normalizado text,
  cpf_cnpj text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_clientes_set_updated_at on public.clientes;
create trigger trg_clientes_set_updated_at
before update on public.clientes
for each row execute function public.set_updated_at();

create unique index idx_clientes_telefone_unique
  on public.clientes (telefone_normalizado);

create unique index idx_clientes_email_unique
  on public.clientes (email_normalizado)
  where email_normalizado is not null and email_normalizado <> '';

create unique index idx_clientes_cpf_cnpj_unique
  on public.clientes (cpf_cnpj)
  where cpf_cnpj is not null and cpf_cnpj <> '';

insert into public.clientes (id, nome, telefone, telefone_normalizado, email, email_normalizado, criado_em, atualizado_em)
select id, nome, telefone, telefone_normalizado, email, email_normalizado, criado_em, atualizado_em
from gestao_crm.clientes;

-- Renomeada para deixar explicito que esta tabela e so a extensao comercial do
-- CRM (mesmo molde de gestao_crm.veiculos_estoque vs. public.veiculos) -- manter
-- o nome "clientes" nos dois schemas causava confusao sobre qual e a identidade
-- e qual e a extensao.
alter table gestao_crm.clientes rename to clientes_crm;

drop index if exists gestao_crm.idx_crm_clientes_telefone_unique;
drop index if exists gestao_crm.idx_crm_clientes_email_unique;

alter table gestao_crm.clientes_crm
  drop column nome,
  drop column telefone,
  drop column telefone_normalizado,
  drop column email,
  drop column email_normalizado;

alter table gestao_crm.clientes_crm
  add constraint clientes_crm_id_fkey foreign key (id) references public.clientes(id);

-- Acesso generico a identidade do cliente: aceita 'crm' OU 'servicos' (mesmo
-- molde de public.veiculo_catalogo_access_level(), 20260914130000).
create or replace function public.cliente_identidade_access_level()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select aus.nivel_acesso
  from public.acessos_usuario_sistema aus
  join public.sistemas s on s.id = aus.sistema_id
  where aus.colaborador_id = public.current_colaborador_id()
    and aus.ativo = true
    and s.slug in ('crm', 'servicos')
    and s.ativo = true
  order by case aus.nivel_acesso when 'admin' then 0 when 'gestor' then 1 else 2 end
  limit 1;
$$;

create or replace function public.cliente_identidade_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'), false);
$$;

grant execute on function public.cliente_identidade_access_level() to authenticated, service_role;
grant execute on function public.cliente_identidade_has_access() to authenticated, service_role;

alter table public.clientes enable row level security;

-- 'usuario' (vendedor) tambem pode gerenciar: hoje crm_can_manage() ja libera
-- 'usuario' para criar/editar cliente via LeadForm/Clientes.jsx -- RLS da
-- identidade nao pode ficar mais restritiva do que ja e hoje.
create policy "cliente_identidade_select" on public.clientes
for select to authenticated using (public.cliente_identidade_has_access());

create policy "cliente_identidade_manage" on public.clientes
for all to authenticated
using (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'))
with check (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'));

grant select, insert, update, delete on public.clientes to authenticated, service_role;

notify pgrst, 'reload schema';
