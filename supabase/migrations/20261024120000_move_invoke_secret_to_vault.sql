-- Move o segredo x-invoke-secret dos cron jobs para o Supabase Vault.
--
-- O valor de INTERNAL_INVOKE_SECRET estava escrito em texto puro em varias migrations (a partir de
-- 20260826160000) e, portanto, no historico do git. Esta migration reagenda os 5 jobs que o usam para
-- ler o segredo do Vault em tempo de execucao (vault.decrypted_secrets, secret 'internal_invoke_secret'),
-- de modo que o valor nunca mais precise aparecer em SQL versionado.
--
-- PRE-REQUISITO (manual, antes de aplicar -- o valor NAO fica neste arquivo):
--   1. Gerar um valor novo (o antigo deve ser considerado comprometido), ex.: openssl rand -hex 32
--   2. supabase secrets set INTERNAL_INVOKE_SECRET=<novo>           (Edge Functions)
--   3. No SQL Editor:  select vault.create_secret('<novo>', 'internal_invoke_secret');
--      (para rotacionar depois: select vault.update_secret(id, '<novo>') com o id de vault.secrets)
-- A migration aborta se o secret nao existir, para nao agendar jobs que mandariam header vazio.
--
-- Aproveita para corrigir crm-veiculos-estoque-expira-reserva, que ainda usava o JWT com
-- "iss":"supase" (typo ja corrigido nos demais jobs em 20260902170000) e portanto tomava 401 no gateway.
-- A chave anon abaixo e publica por design (role anon, mesma do frontend).

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'internal_invoke_secret'
  ) then
    raise exception
      'Secret "internal_invoke_secret" ausente no Vault. Crie com vault.create_secret(...) antes de aplicar esta migration.';
  end if;
end
$$;

do $$
declare
  job record;
begin
  for job in
    select jobid
    from cron.job
    where jobname in (
      'processa-fila-email-every-minute',
      'servicos-lembrete-aprovacoes-hourly',
      'intranet-notifica-aniversariante-daily',
      'crm-veiculos-estoque-expira-reserva',
      'crm-atividades-lembrete-ligacao'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;

-- Mesmo criterio de 20260925120000: so dispara quando ha e-mail pronto para envio.
select cron.schedule(
  'processa-fila-email-every-minute',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/processa-fila-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{"batch_size": 10}'::jsonb
    ) as request_id
    where exists (
      select 1
      from notificacoes.fila_emails
      where status = 'pendente'
        and agendado_em <= now()
    );
  $$
);

select cron.schedule(
  'servicos-lembrete-aprovacoes-hourly',
  '0 * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/servicos-lembrete-aprovacoes',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

select cron.schedule(
  'intranet-notifica-aniversariante-daily',
  '0 8 * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/intranet-notifica-aniversariante',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

select cron.schedule(
  'crm-veiculos-estoque-expira-reserva',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/crm-veiculos-estoque-expira-reserva',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);

select cron.schedule(
  'crm-atividades-lembrete-ligacao',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/crm-atividades-lembrete-ligacao',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicWFjdmxwZ3FocHZuY2pob29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTk5NTAsImV4cCI6MjA5MzY5NTk1MH0.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_invoke_secret')
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
