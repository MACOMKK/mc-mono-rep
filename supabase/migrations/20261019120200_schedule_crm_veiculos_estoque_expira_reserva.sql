-- Agenda o cron (a cada 15 minutos) que dispara a Edge Function
-- crm-veiculos-estoque-expira-reserva, responsavel por liberar reservas de veiculo em estoque cujo
-- reserva_expira_em (20261019120100) ja passou, gravar 'expirado' no historico
-- (veiculos_estoque_historico_reserva) e notificar o vendedor. Mesmo padrao de seguranca
-- (x-invoke-secret) ja usado por processa-fila-email, servicos-lembrete-aprovacoes e
-- intranet-notifica-aniversariante (20260826160000_add_invoke_secret_header_cron_jobs.sql).
-- Function dedicada em vez de SQL puro direto no cron porque precisa gravar historico e notificar
-- -- SQL puro nao cobre isso sem reabrir a trigger generica que a tabela de historico decidiu
-- evitar (gravacao so pela action/edge function, nunca por trigger).

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'crm-veiculos-estoque-expira-reserva'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;
select cron.schedule(
  'crm-veiculos-estoque-expira-reserva',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/crm-veiculos-estoque-expira-reserva',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhc2UiLCJyZWYiOiJqYnFhY3ZscGdxaHB2bmNqaG9vbSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4MTE5OTUwLCJleHAiOjIwOTM2OTU5NTB9.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhc2UiLCJyZWYiOiJqYnFhY3ZscGdxaHB2bmNqaG9vbSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4MTE5OTUwLCJleHAiOjIwOTM2OTU5NTB9.aE39m_f6Mk3EysJ9jdPLLeeMM89Pcm0N9gDv9JZV6ao',
        'x-invoke-secret', 'rJf1vBBA5sfNU3oM3LyjWk5zxFhi4NJv'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
