-- Notificacoes in-app (sino) genericas e cross-app, no schema transversal `notificacoes` (mesmo
-- schema da fila de e-mail). Substitui as tabelas por app (gestao_intranet.notificacoes,
-- gestao_servicos.notificacoes), que tinham exatamente as mesmas colunas -- aqui so ganha
-- `sistema` (slug de public.sistemas) pra separar o sino de cada app.
--
-- Escrita: so Edge Functions (service_role), sempre via `notificar()` de
-- supabase/functions/_shared/notificacoes.ts. Leitura/marcar como lida: Edge Function generica
-- `notificacoes-api`. O grant pra authenticated existe so pro Realtime (que conecta com o JWT do
-- proprio usuario) -- sem ele o evento INSERT nunca chega no client (ver
-- 20260812110000_grant_servicos_notificacoes.sql, mesmo problema).
--
-- Primeiro consumidor: intranet. O servicos continua em gestao_servicos.notificacoes ate ser
-- migrado (em producao, migracao separada).

create table if not exists notificacoes.notificacoes (
  id uuid primary key default gen_random_uuid(),
  sistema text not null,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  tipo text not null default 'geral',
  titulo text not null,
  mensagem text,
  link text,
  referencia_tipo text,
  referencia_id uuid,
  lida_em timestamptz,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_notificacoes_notificacoes_colaborador_sistema_criado
  on notificacoes.notificacoes (colaborador_id, sistema, criado_em desc);

create index if not exists idx_notificacoes_notificacoes_nao_lidas
  on notificacoes.notificacoes (colaborador_id, sistema)
  where lida_em is null;

create index if not exists idx_notificacoes_notificacoes_criado_por
  on notificacoes.notificacoes (criado_por);

alter table notificacoes.notificacoes enable row level security;

-- current_colaborador_id() (id do auth OU email) em vez de auth.uid() direto: nem todo
-- colaborador tem colaboradores.id igual ao uuid do auth (ver comentario em
-- 20260812100000_add_gestao_servicos_notificacoes.sql). `(select ...)` pra avaliar uma vez por
-- query (advisor auth_rls_initplan).
drop policy if exists "notificacoes_select_self" on notificacoes.notificacoes;
create policy "notificacoes_select_self"
  on notificacoes.notificacoes
  for select
  to authenticated
  using (colaborador_id = (select public.current_colaborador_id()));

drop policy if exists "notificacoes_update_self" on notificacoes.notificacoes;
create policy "notificacoes_update_self"
  on notificacoes.notificacoes
  for update
  to authenticated
  using (colaborador_id = (select public.current_colaborador_id()))
  with check (colaborador_id = (select public.current_colaborador_id()));

-- Schema `notificacoes` so concedia acesso a service_role (fila_emails nao e lida por usuario
-- final, e continua sem grant pra authenticated). Aqui o usage do schema + select/update so
-- nesta tabela, protegidos pela RLS acima.
grant usage on schema notificacoes to authenticated;
grant select, update on notificacoes.notificacoes to authenticated;
grant select, insert, update, delete on notificacoes.notificacoes to service_role;

alter table notificacoes.notificacoes replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'notificacoes'
      and tablename = 'notificacoes'
  ) then
    alter publication supabase_realtime add table notificacoes.notificacoes;
  end if;
end
$$;

-- Copia o historico da intranet. `on conflict do nothing` pra poder repetir esta copia na
-- migration que vai dropar gestao_intranet.notificacoes (pega o que tiver sido gravado na
-- tabela antiga entre este push e o deploy do intranet-api novo).
insert into notificacoes.notificacoes (
  id, sistema, colaborador_id, tipo, titulo, mensagem, link, referencia_tipo, referencia_id,
  lida_em, criado_por, criado_em
)
select
  id, 'intranet', colaborador_id, tipo, titulo, mensagem, link, referencia_tipo, referencia_id,
  lida_em, criado_por, criado_em
from gestao_intranet.notificacoes
on conflict (id) do nothing;

-- Limpeza generica (mesma regra que existia so pra intranet: lidas > 90 dias, nao lidas > 180
-- dias), valendo pra todos os sistemas da tabela. Substitui o job da intranet.
create or replace function notificacoes.limpar_notificacoes_antigas()
returns integer
language plpgsql
security definer
set search_path = notificacoes, public
as $$
declare
  deleted_count integer;
begin
  delete from notificacoes.notificacoes
  where (lida_em is not null and criado_em < now() - interval '90 days')
     or (lida_em is null and criado_em < now() - interval '180 days');

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function notificacoes.limpar_notificacoes_antigas() from public;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobid
    from cron.job
    where jobname in ('intranet-notifications-cleanup-daily', 'notificacoes-cleanup-daily')
  loop
    perform cron.unschedule(existing_job_id);
  end loop;
end
$$;

select cron.schedule(
  'notificacoes-cleanup-daily',
  '20 3 * * *',
  $$select notificacoes.limpar_notificacoes_antigas();$$
);
