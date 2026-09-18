-- Separa "dono atual do veiculo" (dado estavel, mudado so por acao explicita
-- de transferencia) de "quem trouxe o veiculo nesse atendimento"
-- (checklist_avaliacoes.cliente_id, que continua existindo como esta). Hoje
-- o "dono" mostrado em VeiculosHistorico.jsx e so o cliente do checklist mais
-- recente -- inferido, nao armazenado -- entao um veiculo ja vinculado a um
-- cliente pode trocar de "dono" silenciosamente se aparecer num checklist
-- novo com outro cliente. Dados de Oficina/CRM ainda sao de teste, entao o
-- backfill por "checklist mais recente" e seguro como aproximacao inicial.

alter table public.veiculos
  add column cliente_atual_id uuid references public.clientes(id);

create table public.veiculos_proprietarios (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete restrict,
  desde timestamptz not null default now(),
  ate timestamptz
);

create index idx_veiculos_proprietarios_veiculo_id
  on public.veiculos_proprietarios (veiculo_id);

-- No maximo 1 proprietario "aberto" (ate is null) por veiculo.
create unique index idx_veiculos_proprietarios_atual
  on public.veiculos_proprietarios (veiculo_id)
  where ate is null;

alter table public.veiculos_proprietarios enable row level security;

-- Mesma regra de acesso de public.clientes (cliente_identidade_*, ver
-- 20260915120000_extract_public_clientes.sql) -- ja cobre crm + servicos.
drop policy if exists "veiculos_proprietarios_select" on public.veiculos_proprietarios;
create policy "veiculos_proprietarios_select" on public.veiculos_proprietarios
for select to authenticated using (public.cliente_identidade_has_access());

drop policy if exists "veiculos_proprietarios_manage" on public.veiculos_proprietarios;
create policy "veiculos_proprietarios_manage" on public.veiculos_proprietarios
for all to authenticated
using (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'))
with check (public.cliente_identidade_access_level() in ('admin', 'gestor', 'usuario'));

grant select, insert, update, delete on public.veiculos_proprietarios to authenticated, service_role;

-- Backfill: cliente do checklist mais recente de cada veiculo vira o
-- proprietario atual (aproximacao -- dados de teste, ok).
insert into public.veiculos_proprietarios (veiculo_id, cliente_id, desde)
select distinct on (ca.veiculo_id) ca.veiculo_id, ca.cliente_id, ca.data_entrada
from gestao_servicos.checklist_avaliacoes ca
where ca.cliente_id is not null
order by ca.veiculo_id, ca.data_entrada desc;

update public.veiculos v
set cliente_atual_id = vp.cliente_id
from public.veiculos_proprietarios vp
where vp.veiculo_id = v.id and vp.ate is null;

notify pgrst, 'reload schema';
