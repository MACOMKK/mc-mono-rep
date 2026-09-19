-- Normaliza public.veiculos.cor (texto livre, digitado igual no cadastro do
-- CRM e da Oficina, gerando "Cinza"/"cinza"/"Cinza Londrino" para a mesma
-- cor) em um catalogo (public.cores_veiculo) + FK. Cor e atributo fisico do
-- veiculo (como chassi/placa/km), por isso mora em public, nao em
-- gestao_crm nem gestao_servicos -- mesmo raciocinio da extracao de
-- public.veiculos em 20260910130000_extract_public_veiculos.sql.

create table public.cores_veiculo (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

alter table public.cores_veiculo enable row level security;

create policy "cores_veiculo_select" on public.cores_veiculo
for select to authenticated using (public.crm_has_access());

create policy "cores_veiculo_manage" on public.cores_veiculo
for all to authenticated
using (public.crm_access_level() in ('admin', 'gestor'))
with check (public.crm_access_level() in ('admin', 'gestor'));

grant select, insert, update, delete on public.cores_veiculo to authenticated, service_role;

insert into public.cores_veiculo (nome)
select distinct trim(cor)
from public.veiculos
where cor is not null and trim(cor) <> '';

alter table public.veiculos
  add column cor_id uuid references public.cores_veiculo(id);

update public.veiculos v
set cor_id = cv.id
from public.cores_veiculo cv
where cv.nome = trim(v.cor);

alter table public.veiculos
  drop column cor;

create index idx_veiculos_cor_id on public.veiculos (cor_id);

notify pgrst, 'reload schema';
