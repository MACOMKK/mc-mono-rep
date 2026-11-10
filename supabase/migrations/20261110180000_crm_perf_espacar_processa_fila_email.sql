-- Espaca o cron processa-fila-email (jobid 22) de 1 min para 5 min, reduzindo chamadas de
-- net.http_post e a limpeza do pg_net (ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item C).
-- Ja aplicada via `db query --linked` em 2026-11-10; este arquivo documenta a mudanca.
-- Rollback: select cron.alter_job(22, schedule => '* * * * *');
select cron.alter_job(
  (select jobid from cron.job where command like '%functions/v1/processa-fila-email%' limit 1),
  schedule => '*/5 * * * *'
);
