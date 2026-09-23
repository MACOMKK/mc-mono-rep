-- Reintroduz slug em public.empresas: nome e editavel e nao deve ser usado
-- como chave de comparacao estavel em codigo (ex.: filtro de unidades da
-- "Macom Motos" em servicos-oficina-api). Slug tinha sido removido em
-- 20260709120000_simplify_empresas_link_unidades.sql; volta aqui como
-- identificador estavel, sem mexer no restante daquela simplificacao.

alter table public.empresas
  add column if not exists slug text;

update public.empresas
set slug = case
  when nome = 'Macom Mitsubishi' then 'macom_mitsubishi'
  when nome = 'Macom Motos' then 'macom_motos'
  else lower(regexp_replace(trim(nome), '\s+', '_', 'g'))
end
where slug is null;

alter table public.empresas
  alter column slug set not null;

create unique index if not exists empresas_slug_unique
  on public.empresas (slug);

-- O Central cria empresas via insert generico (central-api, action "create")
-- que so envia os campos do formulario -- hoje so "nome" (ver
-- apps/central/src/pages/catalog-manager/config/simpleEntityConfigs.jsx,
-- buildCompaniesConfig). Sem esse trigger, toda criacao pelo Central violaria
-- o NOT NULL acima. Gera o slug a partir do nome quando ele nao vier
-- preenchido, sem exigir mudanca nenhuma no Central.
create or replace function public.empresas_set_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is null or btrim(new.slug) = '' then
    new.slug := lower(regexp_replace(btrim(new.nome), '\s+', '_', 'g'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_empresas_set_slug on public.empresas;
create trigger trg_empresas_set_slug
  before insert or update on public.empresas
  for each row execute function public.empresas_set_slug();

notify pgrst, 'reload schema';
