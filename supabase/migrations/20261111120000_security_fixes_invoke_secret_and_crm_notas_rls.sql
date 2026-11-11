-- Duas correcoes de seguranca independentes, na mesma migration por serem pequenas e do mesmo
-- lote de revisao (2026-11-11):
--
-- 1) O cron 'security-alerta-picos-login-15min' nunca foi migrado para o Vault em
--    20261024120000_move_invoke_secret_to_vault.sql (ficou fora da lista de jobs daquela
--    migration) e por isso nao mandava o header 'x-invoke-secret' -- a function, ate agora, nem
--    verificava esse header, entao qualquer chamada com a anon key (publica) disparava o alerta
--    e recebia de volta IPs/e-mails sob ataque. A function (supabase/functions/
--    security-alerta-picos-login/index.ts) ja passou a exigir o header; esta migration so
--    reagenda o job para enviar o segredo lido do Vault, mesmo padrao dos demais 5 jobs.
--
-- 2) gestao_crm.notas_conversa (20261105110000_add_crm_notas_conversa.sql) foi criada sem
--    `enable row level security`, herdando os grants amplos de CRUD para `authenticated` dados em
--    20260618150000_add_gestao_crm_core.sql (alter default privileges). O schema gestao_crm nunca
--    e exposto via PostgREST hoje (so acessado pela crm-api com DATABASE_URL, que bypassa RLS),
--    mas fica inconsistente com o resto do schema e e risco latente -- mesmo padrao de
--    20261020140000_crm_veiculos_estoque_historico_reserva_rls.sql.

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
    where jobname = 'security-alerta-picos-login-15min'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'security-alerta-picos-login-15min',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://jbqacvlpgqhpvncjhoom.supabase.co/functions/v1/security-alerta-picos-login',
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

-- RLS em gestao_crm.notas_conversa (mesmo padrao de crm_veiculos_estoque_historico_reserva).
alter table gestao_crm.notas_conversa enable row level security;

drop policy if exists "crm_notas_conversa_select" on gestao_crm.notas_conversa;
create policy "crm_notas_conversa_select" on gestao_crm.notas_conversa
for select to authenticated using (public.crm_has_access());

revoke insert, update, delete on gestao_crm.notas_conversa from authenticated;
grant select on gestao_crm.notas_conversa to authenticated;
grant select, insert, update, delete on gestao_crm.notas_conversa to service_role;

notify pgrst, 'reload schema';
