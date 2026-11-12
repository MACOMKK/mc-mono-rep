-- Alerta de saude da plataforma (pool de conexoes, queries travadas, cron e fila de e-mail).
--
-- Por que no banco (pg_cron) e nao numa Edge Function: as functions dividem o pool de 15
-- conexoes do Supavisor. Quando ele enche, uma function de monitoramento tambem nao conecta.
-- O pg_cron roda dentro do Postgres, sem passar pelo pooler, entao funciona justamente nessa hora.
-- O envio do e-mail (`processa-fila-email`) le a fila pelo PostgREST, que tambem nao usa o pooler.
--
-- A cada minuto `gestao_plataforma.verificar_saude()`:
--   1. conta as conexoes do pool (usename 'postgres' + application_name 'Supavisor' -- todas as
--      Edge Functions aparecem assim, sem distinguir qual e qual) e o total de conexoes;
--   2. procura queries 'active' ou 'idle in transaction' ha mais de N segundos;
--   3. procura execucoes de cron com falha e chamadas HTTP de cron (pg_net) com erro/timeout
--      desde a ultima verificacao;
--   4. procura e-mails que viraram 'erro' na fila desde a ultima verificacao.
-- Para cada problema grava uma linha em `gestao_plataforma.alertas_saude` com uma foto do
-- pg_stat_activity (texto das queries -> o schema mostra de qual sistema veio). E-mail: no maximo
-- 1 por tipo de alerta a cada `intervalo_repeticao_min`, para os enderecos em
-- `config_alertas_saude.destinatarios` (vazio = so grava, nao envia).
--
-- Excecao documentada a regra "enfileirar sempre via enqueueEmail()": aqui o insert em
-- notificacoes.fila_emails e feito em SQL porque o codigo roda dentro do banco. O payload segue
-- o mesmo formato do enqueueEmail ({ to, subject, body_text }).
--
-- Configurar destinatarios (exemplo):
--   update gestao_plataforma.config_alertas_saude set destinatarios = array['alguem@dominio'];
-- Consultar:
--   select * from gestao_plataforma.alertas_saude order by criado_em desc limit 20;
-- Rollback:
--   select cron.unschedule('plataforma-verificar-saude');
--   drop function gestao_plataforma.verificar_saude();
--   drop table gestao_plataforma.alertas_saude, gestao_plataforma.config_alertas_saude;

create table if not exists gestao_plataforma.config_alertas_saude (
  id boolean primary key default true constraint config_alertas_saude_unica check (id),
  ativo boolean not null default true,
  destinatarios text[] not null default '{}',
  limite_conexoes_pool integer not null default 12,   -- de 15 no plano Nano
  limite_conexoes_total integer not null default 50,  -- de max_connections 60
  limite_query_segundos integer not null default 15,
  intervalo_repeticao_min integer not null default 30,
  retencao_dias integer not null default 90,
  ultima_verificacao timestamptz,
  atualizado_em timestamptz not null default now()
);

insert into gestao_plataforma.config_alertas_saude (id) values (true)
on conflict (id) do nothing;

create table if not exists gestao_plataforma.alertas_saude (
  id bigint generated always as identity primary key,
  criado_em timestamptz not null default now(),
  tipo text not null,
  resumo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  email_enfileirado boolean not null default false,
  constraint alertas_saude_tipo_check check (
    tipo in ('pool_conexoes', 'total_conexoes', 'query_travada', 'cron_falha', 'cron_http_falha', 'email_erro')
  )
);

create index if not exists idx_alertas_saude_tipo_criado_em
  on gestao_plataforma.alertas_saude (tipo, criado_em desc);
create index if not exists idx_alertas_saude_criado_em
  on gestao_plataforma.alertas_saude (criado_em desc);

-- Sem policies: so service_role / postgres acessam. Nada disso e exposto aos apps.
alter table gestao_plataforma.config_alertas_saude enable row level security;
alter table gestao_plataforma.alertas_saude enable row level security;
revoke all on gestao_plataforma.config_alertas_saude from anon, authenticated;
revoke all on gestao_plataforma.alertas_saude from anon, authenticated;

create or replace function gestao_plataforma.verificar_saude()
returns void
language plpgsql
set search_path = ''
as $$
declare
  cfg gestao_plataforma.config_alertas_saude%rowtype;
  desde timestamptz;
  foto jsonb;
  n_pool integer;
  n_total integer;
  n integer;
  travadas jsonb;
  falhas jsonb;
  achados jsonb := '[]'::jsonb;  -- [{tipo, resumo, detalhes}]
  achado jsonb;
  enviar boolean;
  dest text;
  corpo text;
begin
  select * into cfg from gestao_plataforma.config_alertas_saude where id;
  if not found or not cfg.ativo then
    return;
  end if;

  desde := coalesce(cfg.ultima_verificacao, now() - interval '2 minutes');

  -- Foto das conexoes de clientes (exceto a propria verificacao), mais antigas primeiro.
  select coalesce(jsonb_agg(c order by c.segundos desc nulls last), '[]'::jsonb)
    into foto
  from (
    select
      a.pid,
      a.usename,
      a.application_name as app,
      a.state,
      a.wait_event_type,
      a.wait_event,
      extract(epoch from (now() - coalesce(a.xact_start, a.query_start)))::integer as segundos,
      left(regexp_replace(a.query, '\s+', ' ', 'g'), 300) as query
    from pg_catalog.pg_stat_activity a
    where a.backend_type = 'client backend'
      and a.pid <> pg_catalog.pg_backend_pid()
    limit 40
  ) c;

  select
    count(*) filter (where a.usename = 'postgres' and a.application_name = 'Supavisor'),
    count(*)
    into n_pool, n_total
  from pg_catalog.pg_stat_activity a
  where a.backend_type = 'client backend';

  if n_pool >= cfg.limite_conexoes_pool then
    achados := achados || jsonb_build_object(
      'tipo', 'pool_conexoes',
      'resumo', format('Pool das Edge Functions com %s conexoes (limite de alerta %s, pool 15).', n_pool, cfg.limite_conexoes_pool),
      'detalhes', jsonb_build_object('conexoes_pool', n_pool, 'conexoes_total', n_total, 'foto', foto)
    );
  end if;

  if n_total >= cfg.limite_conexoes_total then
    achados := achados || jsonb_build_object(
      'tipo', 'total_conexoes',
      'resumo', format('Banco com %s conexoes de clientes (limite de alerta %s, max_connections 60).', n_total, cfg.limite_conexoes_total),
      'detalhes', jsonb_build_object('conexoes_pool', n_pool, 'conexoes_total', n_total, 'foto', foto)
    );
  end if;

  -- 'idle in transaction' segura a conexao do pool sem fazer nada: suspeito classico.
  select jsonb_agg(f) into travadas
  from jsonb_array_elements(foto) f
  where f->>'state' in ('active', 'idle in transaction', 'idle in transaction (aborted)')
    and (f->>'segundos')::integer >= cfg.limite_query_segundos
    and coalesce(f->>'app', '') not in ('pg_cron', 'postgres_exporter')
    and f->>'usename' not in ('supabase_admin', 'supabase_replication_admin');

  if travadas is not null then
    achados := achados || jsonb_build_object(
      'tipo', 'query_travada',
      'resumo', format('%s conexao(oes) ativas ou presas em transacao ha mais de %s s.', jsonb_array_length(travadas), cfg.limite_query_segundos),
      'detalhes', jsonb_build_object('travadas', travadas, 'conexoes_pool', n_pool, 'foto', foto)
    );
  end if;

  select jsonb_agg(jsonb_build_object(
           'job', j.jobname, 'inicio', d.start_time, 'mensagem', left(d.return_message, 300)))
    into falhas
  from cron.job_run_details d
  left join cron.job j on j.jobid = d.jobid
  where d.status = 'failed'
    and d.start_time >= desde;

  if falhas is not null then
    achados := achados || jsonb_build_object(
      'tipo', 'cron_falha',
      'resumo', format('%s execucao(oes) de cron falharam.', jsonb_array_length(falhas)),
      'detalhes', jsonb_build_object('falhas', falhas)
    );
  end if;

  -- Cron que chama Edge Function via net.http_post: o job "da certo" mesmo se a function falhar;
  -- o resultado real fica em net._http_response (guardado por ~6 h). A URL nao fica gravada.
  select jsonb_agg(jsonb_build_object(
           'id', r.id, 'quando', r.created, 'status', r.status_code,
           'timeout', r.timed_out, 'erro', left(r.error_msg, 300)))
    into falhas
  from net._http_response r
  where r.created >= desde
    and (r.timed_out or r.status_code is null or r.status_code >= 400);

  if falhas is not null then
    achados := achados || jsonb_build_object(
      'tipo', 'cron_http_falha',
      'resumo', format('%s chamada(s) de cron para Edge Function com erro ou timeout.', jsonb_array_length(falhas)),
      'detalhes', jsonb_build_object('falhas', falhas)
    );
  end if;

  select jsonb_agg(jsonb_build_object(
           'id', e.id, 'tipo', e.tipo, 'tentativas', e.tentativas, 'erro', left(e.erro, 300)))
    into falhas
  from notificacoes.fila_emails e
  where e.status = 'erro'
    and e.atualizado_em >= desde
    and e.tipo <> 'alerta_saude';  -- evita alerta sobre o proprio alerta

  if falhas is not null then
    achados := achados || jsonb_build_object(
      'tipo', 'email_erro',
      'resumo', format('%s e-mail(s) da fila falharam de vez.', jsonb_array_length(falhas)),
      'detalhes', jsonb_build_object('falhas', falhas)
    );
  end if;

  for achado in select * from jsonb_array_elements(achados) loop
    enviar := cardinality(cfg.destinatarios) > 0 and not exists (
      select 1 from gestao_plataforma.alertas_saude s
      where s.tipo = achado->>'tipo'
        and s.email_enfileirado
        and s.criado_em > now() - make_interval(mins => cfg.intervalo_repeticao_min)
    );

    insert into gestao_plataforma.alertas_saude (tipo, resumo, detalhes, email_enfileirado)
    values (achado->>'tipo', achado->>'resumo', achado->'detalhes', enviar);

    if enviar then
      corpo := format(
        E'%s\n\nHorario: %s (UTC %s)\n\nDetalhes (JSON):\n%s\n\n'
        'Historico completo: select * from gestao_plataforma.alertas_saude order by criado_em desc;\n'
        'Proximo e-mail deste tipo so depois de %s min.',
        achado->>'resumo',
        to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS'),
        to_char(now() at time zone 'UTC', 'HH24:MI:SS'),
        left(jsonb_pretty(achado->'detalhes'), 12000),
        cfg.intervalo_repeticao_min
      );

      foreach dest in array cfg.destinatarios loop
        insert into notificacoes.fila_emails (tipo, destinatario, assunto, payload, max_tentativas)
        values (
          'alerta_saude',
          dest,
          '[MACOM] Alerta de saude: ' || (achado->>'tipo'),
          jsonb_build_object('to', dest, 'subject', '[MACOM] Alerta de saude: ' || (achado->>'tipo'), 'body_text', corpo),
          3
        );
      end loop;
    end if;
  end loop;

  update gestao_plataforma.config_alertas_saude set ultima_verificacao = now() where id;

  -- Limpeza do historico (barata: indice por criado_em).
  delete from gestao_plataforma.alertas_saude
  where criado_em < now() - make_interval(days => cfg.retencao_dias);
end;
$$;

revoke all on function gestao_plataforma.verificar_saude() from public, anon, authenticated;

select cron.schedule(
  'plataforma-verificar-saude',
  '* * * * *',
  'select gestao_plataforma.verificar_saude();'
);
