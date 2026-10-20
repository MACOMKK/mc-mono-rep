-- Nivel 2 da auditoria do CRM (2026-10-20): gestao_crm.veiculos_estoque_historico_reserva
-- (20261019120000) foi criada sem `enable row level security` -- unica tabela do schema sem RLS,
-- herdando grants completos de CRUD para `authenticated` via `alter default privileges`. Nao e
-- exploravel hoje porque gestao_crm nunca e exposto via PostgREST (so acessado pela crm-api com a
-- service role, que bypassa RLS), mas fica inconsistente com o resto do schema e e um risco latente
-- se isso mudar. Tabela e documentada como "somente leitura via API, gravada so pela action
-- veiculo_estoque_reserva e pela edge function de expiracao por TTL" -- entao so ganha policy de
-- select; insert/update/delete via authenticated seguem bloqueados por nao ter policy (RLS nega por
-- padrao), igual historico_atendimentos.

alter table gestao_crm.veiculos_estoque_historico_reserva enable row level security;

drop policy if exists "crm_veiculos_estoque_historico_reserva_select" on gestao_crm.veiculos_estoque_historico_reserva;
create policy "crm_veiculos_estoque_historico_reserva_select" on gestao_crm.veiculos_estoque_historico_reserva
for select to authenticated using (public.crm_has_access());

revoke insert, update, delete on gestao_crm.veiculos_estoque_historico_reserva from authenticated;
grant select on gestao_crm.veiculos_estoque_historico_reserva to authenticated;
grant select, insert, update, delete on gestao_crm.veiculos_estoque_historico_reserva to service_role;

notify pgrst, 'reload schema';
