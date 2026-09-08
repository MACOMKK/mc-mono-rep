-- Corrige multiple_permissive_policies (advisor de performance) em public.sistemas.
-- A tabela tinha DUAS policies FOR SELECT com a MESMA condicao (qual: true) para
-- authenticated: "sistemas_read_authenticated" e "sistemas_select_authenticated".
-- Duplicata exata - (true) OR (true) e' o mesmo que (true). Nenhuma mudanca de quem
-- acessa o que. Mantemos "sistemas_read_authenticated" e removemos a duplicata.
-- Ver SUPABASE_PERFORMANCE_INVESTIGACAO.md, item B.
--
-- Definicao original da policy removida (para rollback via CREATE POLICY, caso necessario):
--
-- create policy sistemas_select_authenticated on public.sistemas
--   for select using (true);

drop policy sistemas_select_authenticated on public.sistemas;
