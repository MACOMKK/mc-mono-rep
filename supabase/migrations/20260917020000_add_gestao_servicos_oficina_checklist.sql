-- Modulo Oficina (servicos): primeira funcionalidade real, o Checklist Digital
-- de Inspecao de Veiculos. Schema adaptado de um app standalone (Lovable,
-- "estrutura-banco-macom.sql", 2026-09-14) para o padrao do monorepo:
-- funcionario/cliente/placa em texto livre viram FK para public.colaboradores/
-- public.clientes/public.veiculos (ja extraidos para reuso entre CRM e
-- Servicos -- ver 20260910130000_extract_public_veiculos.sql e
-- 20260915120000_extract_public_clientes.sql), e RLS aberta ("USING (true)")
-- vira RLS gated pela Camada 2 de permissao do servicos (papel no modulo
-- 'oficina', ver migration seguinte 20260917030000).
--
-- assinatura_responsavel do app original nao existe aqui -- o colaborador ja
-- assina uma vez no perfil (public.colaboradores.assinatura_url, ver
-- 20260831120000_add_assinatura_colaborador.sql) e essa assinatura e
-- compartilhada entre apps; a tela/PDF le por colaborador_id.

create sequence if not exists gestao_servicos.checklist_avaliacao_numero_seq;

create table if not exists gestao_servicos.checklist_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('gestao_servicos.checklist_avaliacao_numero_seq'),
  colaborador_id uuid not null references public.colaboradores(id) on delete restrict,
  cliente_id uuid references public.clientes(id) on delete restrict,
  veiculo_id uuid not null references public.veiculos(id) on delete restrict,
  os text,
  data date not null default current_date,
  km integer,
  nivel_combustivel numeric not null default 0.5,
  pintura_suja boolean not null default false,
  entrega_conferida boolean not null default false,
  observacoes text,
  entrega_observacoes text,
  comunicacoes jsonb not null default '[]'::jsonb,
  status text not null default 'em_andamento'
    check (status in ('em_andamento', 'finalizado')),
  data_entrada timestamptz not null default now(),
  data_saida timestamptz,
  assinatura_cliente text,
  fotos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_checklist_avaliacoes_status
  on gestao_servicos.checklist_avaliacoes (status);
create index if not exists idx_checklist_avaliacoes_colaborador_id
  on gestao_servicos.checklist_avaliacoes (colaborador_id);
create index if not exists idx_checklist_avaliacoes_cliente_id
  on gestao_servicos.checklist_avaliacoes (cliente_id);
create index if not exists idx_checklist_avaliacoes_veiculo_id
  on gestao_servicos.checklist_avaliacoes (veiculo_id);
create index if not exists idx_checklist_avaliacoes_data_entrada
  on gestao_servicos.checklist_avaliacoes (data_entrada desc);

drop trigger if exists trg_checklist_avaliacoes_set_updated_at on gestao_servicos.checklist_avaliacoes;
create trigger trg_checklist_avaliacoes_set_updated_at
before update on gestao_servicos.checklist_avaliacoes
for each row
execute function public.set_updated_at();

create table if not exists gestao_servicos.checklist_avarias (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references gestao_servicos.checklist_avaliacoes(id) on delete cascade,
  tipo text not null check (tipo in ('quebrado', 'amassado', 'riscado', 'mancha')),
  pos_x numeric not null,
  pos_y numeric not null,
  area text,
  observacao text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_checklist_avarias_avaliacao_id
  on gestao_servicos.checklist_avarias (avaliacao_id);

create table if not exists gestao_servicos.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  avaliacao_id uuid not null references gestao_servicos.checklist_avaliacoes(id) on delete cascade,
  categoria text not null check (categoria in ('documentacao', 'seguranca', 'pneus')),
  item text not null,
  status text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_checklist_itens_avaliacao_id
  on gestao_servicos.checklist_itens (avaliacao_id);

-- Capacidade de ver/editar checklist, derivada do papel no modulo 'oficina'
-- (Camada 2, gestao_servicos.permissoes_modulo -- papeis 'inspetor'/'gestor'
-- adicionados na migration seguinte). Nao existe hierarquia de aprovacao
-- aqui (diferente do Financeiro): qualquer papel != 'nenhum' pode ler,
-- inspetor/gestor podem gravar.
create or replace function public.servicos_oficina_pode_ver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.servicos_module_role('oficina') is distinct from 'nenhum'
    and public.servicos_module_role('oficina') is not null;
$$;

create or replace function public.servicos_oficina_pode_editar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.servicos_module_role('oficina') in ('inspetor', 'gestor', 'admin'), false);
$$;

alter table gestao_servicos.checklist_avaliacoes enable row level security;

drop policy if exists "servicos_oficina_checklist_avaliacoes_select" on gestao_servicos.checklist_avaliacoes;
create policy "servicos_oficina_checklist_avaliacoes_select" on gestao_servicos.checklist_avaliacoes
for select to authenticated using (public.servicos_oficina_pode_ver());

drop policy if exists "servicos_oficina_checklist_avaliacoes_insert" on gestao_servicos.checklist_avaliacoes;
create policy "servicos_oficina_checklist_avaliacoes_insert" on gestao_servicos.checklist_avaliacoes
for insert to authenticated with check (public.servicos_oficina_pode_editar());

drop policy if exists "servicos_oficina_checklist_avaliacoes_update" on gestao_servicos.checklist_avaliacoes;
create policy "servicos_oficina_checklist_avaliacoes_update" on gestao_servicos.checklist_avaliacoes
for update to authenticated
using (public.servicos_oficina_pode_editar())
with check (public.servicos_oficina_pode_editar());

alter table gestao_servicos.checklist_avarias enable row level security;

drop policy if exists "servicos_oficina_checklist_avarias_select" on gestao_servicos.checklist_avarias;
create policy "servicos_oficina_checklist_avarias_select" on gestao_servicos.checklist_avarias
for select to authenticated using (public.servicos_oficina_pode_ver());

drop policy if exists "servicos_oficina_checklist_avarias_write" on gestao_servicos.checklist_avarias;
create policy "servicos_oficina_checklist_avarias_write" on gestao_servicos.checklist_avarias
for all to authenticated
using (public.servicos_oficina_pode_editar())
with check (public.servicos_oficina_pode_editar());

alter table gestao_servicos.checklist_itens enable row level security;

drop policy if exists "servicos_oficina_checklist_itens_select" on gestao_servicos.checklist_itens;
create policy "servicos_oficina_checklist_itens_select" on gestao_servicos.checklist_itens
for select to authenticated using (public.servicos_oficina_pode_ver());

drop policy if exists "servicos_oficina_checklist_itens_write" on gestao_servicos.checklist_itens;
create policy "servicos_oficina_checklist_itens_write" on gestao_servicos.checklist_itens
for all to authenticated
using (public.servicos_oficina_pode_editar())
with check (public.servicos_oficina_pode_editar());

grant select, insert, update, delete
  on gestao_servicos.checklist_avaliacoes, gestao_servicos.checklist_avarias, gestao_servicos.checklist_itens
  to authenticated, service_role;

notify pgrst, 'reload schema';
