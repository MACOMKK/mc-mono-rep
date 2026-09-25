-- Reduz Log Ingestion do Supabase: o cron processa-fila-email disparava a Edge Function a cada
-- minuto (1.440x/dia) mesmo com a fila vazia, gerando logs de pg_net, API Gateway e Edge Function
-- em toda chamada. Agora o proprio SQL do cron so faz o net.http_post quando existe pelo menos um
-- e-mail pronto para envio -- mesmo criterio que processa-fila-email usa para selecionar o lote
-- (status = 'pendente' e agendado_em <= now()), entao o backoff por agendado_em continua valendo.
--
-- Headers/secret iguais aos de 20260902170000_fix_cron_jobs_invalid_anon_key_typo.sql.

do $$
declare
  job record;
begin
  for job in
    select jobid from cron.job where jobname = 'processa-fila-email-every-minute'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;

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
        'x-invoke-secret', 'rJf1vBBA5sfNU3oM3LyjWk5zxFhi4NJv'
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
