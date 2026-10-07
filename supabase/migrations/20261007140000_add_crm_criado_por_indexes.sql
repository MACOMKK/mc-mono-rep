-- access-scope.ts (nivel 'usuario') filtra por (responsavel_id = $1 or criado_por = $1).
-- responsavel_id ja tem indice; criado_por nao, o que impede um BitmapOr eficiente no OR
-- acima e derruba pra seq scan conforme a tabela cresce. Indices aditivos, sem CONCURRENTLY
-- (nenhuma migration do repo usa; roda dentro da transacao do runner do Supabase CLI).
create index if not exists idx_crm_leads_criado_por on gestao_crm.leads (criado_por);
create index if not exists idx_crm_clientes_crm_criado_por on gestao_crm.clientes_crm (criado_por);

notify pgrst, 'reload schema';
