-- Aumenta o timeout do net.http_post do cron 'servicos-lembrete-aprovacoes-hourly'.
--
-- O default do pg_net (5000 ms) e curto demais quando ha varias solicitacoes pendentes na mesma
-- hora: a Edge Function faz 4 queries sequenciais por solicitacao (insert notificacao, push,
-- update, insert historico) e, com cold start do Deno, passa dos 5 s. Isso nao perde lembrete
-- nenhum -- a function termina o trabalho normalmente, so a resposta HTTP nao volta a tempo --
-- mas gera falso alerta em gestao_plataforma.alertas_saude (tipo cron_http_falha, ver
-- 20261112130000_plataforma_alertas_saude.sql). Como o cron e fire-and-forget (nao usa o
-- request_id retornado), so precisa dar tempo da function responder.
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
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    ) as request_id;
  $$
);
