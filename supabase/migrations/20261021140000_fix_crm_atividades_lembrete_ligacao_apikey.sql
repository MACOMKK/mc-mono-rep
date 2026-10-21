-- Corrige o cron crm-atividades-lembrete-ligacao (20261021130000): a migration anterior
-- copiou o anon key/Authorization do template de crm-veiculos-estoque-expira-reserva
-- (20261019120200) com um JWT corrompido (payload "iss":"supase" em vez de "supabase" -- o
-- template original ja tinha esse typo, nao e exclusivo desta migration). Um JWT com "iss"
-- incorreto falha a verificacao no gateway de Edge Functions (401), entao o cron nunca
-- conseguia invocar a function. Reagenda com o anon key correto.

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'crm-atividades-lembrete-ligacao'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;
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
        'x-invoke-secret', 'rJf1vBBA5sfNU3oM3LyjWk5zxFhi4NJv'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
