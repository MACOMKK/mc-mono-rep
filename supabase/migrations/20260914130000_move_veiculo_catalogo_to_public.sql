-- O catalogo de veiculo (categorias/marcas/modelos/versoes) e puro dado de
-- referencia, sem regra de negocio do CRM, mas vivia em gestao_crm. public.veiculos
-- ja tinha sido extraido de gestao_crm.veiculos_estoque com a intencao explicita de
-- reuso por outros apps (ex.: futuro modulo Oficina do app servicos) -- o catalogo
-- em si ficou pra tras. Esta migration completa essa extracao.
--
-- ALTER TABLE ... SET SCHEMA preserva ids, FKs (inclusive as que apontam de
-- gestao_crm.veiculos_interesse e de public.veiculos para essas tabelas), indices,
-- triggers e RLS policies -- nao precisa recriar nem copiar dado. As funcoes de
-- gestao_crm (ex.: prepare_lead_phase1) ja rodam com search_path = gestao_crm,
-- public, entao continuam resolvendo essas tabelas sem qualificacao extra.

alter table gestao_crm.categorias_veiculo set schema public;
alter table gestao_crm.marcas_veiculo set schema public;
alter table gestao_crm.modelos_veiculo set schema public;
alter table gestao_crm.versoes_veiculo set schema public;

-- Acesso generico ao catalogo de veiculo: hoje so existe crm_has_access()/
-- crm_access_level(), que checam especificamente sistemas.slug = 'crm'. Isso
-- bloquearia um usuario do app servicos sem acesso ao CRM, mesmo depois do
-- catalogo virar "publico" -- entao criamos uma checagem que aceita acesso a
-- 'crm' OU 'servicos', no mesmo molde de public.crm_access_level().
create or replace function public.veiculo_catalogo_access_level()
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

create or replace function public.veiculo_catalogo_has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.veiculo_catalogo_access_level() in ('admin', 'gestor', 'usuario'), false);
$$;

grant execute on function public.veiculo_catalogo_access_level() to authenticated, service_role;
grant execute on function public.veiculo_catalogo_has_access() to authenticated, service_role;

-- Substitui as policies das 4 tabelas de catalogo (mesmo shape de antes, so
-- trocando crm_has_access()/crm_access_level() pelas funcoes genericas acima).
drop policy if exists "crm_categorias_veiculo_select" on public.categorias_veiculo;
create policy "veiculo_catalogo_categorias_select" on public.categorias_veiculo
for select to authenticated using (public.veiculo_catalogo_has_access());

drop policy if exists "crm_categorias_veiculo_manage" on public.categorias_veiculo;
drop policy if exists "crm_categorias_veiculo_manage_insert" on public.categorias_veiculo;
drop policy if exists "crm_categorias_veiculo_manage_update" on public.categorias_veiculo;
drop policy if exists "crm_categorias_veiculo_manage_delete" on public.categorias_veiculo;
create policy "veiculo_catalogo_categorias_manage" on public.categorias_veiculo
for all to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'))
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_marcas_veiculo_select" on public.marcas_veiculo;
create policy "veiculo_catalogo_marcas_select" on public.marcas_veiculo
for select to authenticated using (public.veiculo_catalogo_has_access());

drop policy if exists "crm_marcas_veiculo_insert" on public.marcas_veiculo;
drop policy if exists "crm_marcas_veiculo_update" on public.marcas_veiculo;
drop policy if exists "crm_marcas_veiculo_delete" on public.marcas_veiculo;
create policy "veiculo_catalogo_marcas_manage" on public.marcas_veiculo
for all to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'))
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_modelos_veiculo_select" on public.modelos_veiculo;
create policy "veiculo_catalogo_modelos_select" on public.modelos_veiculo
for select to authenticated using (public.veiculo_catalogo_has_access());

drop policy if exists "crm_modelos_veiculo_insert" on public.modelos_veiculo;
drop policy if exists "crm_modelos_veiculo_update" on public.modelos_veiculo;
drop policy if exists "crm_modelos_veiculo_delete" on public.modelos_veiculo;
create policy "veiculo_catalogo_modelos_manage" on public.modelos_veiculo
for all to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'))
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

drop policy if exists "crm_versoes_veiculo_select" on public.versoes_veiculo;
create policy "veiculo_catalogo_versoes_select" on public.versoes_veiculo
for select to authenticated using (public.veiculo_catalogo_has_access());

drop policy if exists "crm_versoes_veiculo_insert" on public.versoes_veiculo;
drop policy if exists "crm_versoes_veiculo_update" on public.versoes_veiculo;
drop policy if exists "crm_versoes_veiculo_delete" on public.versoes_veiculo;
create policy "veiculo_catalogo_versoes_manage" on public.versoes_veiculo
for all to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'))
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

-- public.veiculos ja tinha sido pensada como generica (comentario da migration
-- 20260910130000), mas ficou com RLS especifico do CRM -- corrige o mesmo gap.
drop policy if exists "veiculos_select" on public.veiculos;
create policy "veiculo_catalogo_veiculos_select" on public.veiculos
for select to authenticated using (public.veiculo_catalogo_has_access());

drop policy if exists "veiculos_insert" on public.veiculos;
create policy "veiculo_catalogo_veiculos_insert" on public.veiculos
for insert to authenticated
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

drop policy if exists "veiculos_update" on public.veiculos;
create policy "veiculo_catalogo_veiculos_update" on public.veiculos
for update to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'))
with check (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

drop policy if exists "veiculos_delete" on public.veiculos;
create policy "veiculo_catalogo_veiculos_delete" on public.veiculos
for delete to authenticated
using (public.veiculo_catalogo_access_level() in ('admin', 'gestor'));

notify pgrst, 'reload schema';
