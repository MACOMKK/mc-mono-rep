-- Mensagens rapidas (respostas pre-definidas) do chat de Atendimento: ate aqui era uma lista fixa
-- hardcoded em MensagemComposer.jsx (TEMPLATES_RESPOSTA_RAPIDA) sem nenhuma tela de cadastro --
-- o atendente so conseguia usar as 4 do codigo, nunca criar as proprias. Catalogo global
-- (sem unidade_id/posse, mesmo espirito de origens_lead) porque e' um texto de apoio de equipe,
-- nao um dado exclusivo de quem criou -- qualquer atendente pode criar/editar/excluir qualquer
-- mensagem rapida, ve-las todas no dropdown do composer.

create table gestao_crm.mensagens_rapidas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  ativo boolean not null default true,
  criado_por uuid references public.colaboradores(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists trg_crm_mensagens_rapidas_set_updated_at on gestao_crm.mensagens_rapidas;
create trigger trg_crm_mensagens_rapidas_set_updated_at
before update on gestao_crm.mensagens_rapidas
for each row execute function public.set_updated_at();

-- RLS so' protege o caminho via PostgREST (anon/authenticated) -- o crm-api conecta direto no
-- banco (ver createSql em index.ts) e e' quem decide create/update/delete no codigo
-- (ensureCanManage libera admin/gestor/usuario; sem gate extra tipo ensureCanConfigure, ja que
-- qualquer atendente pode gerenciar). Mesmo padrao hardened de notas_conversa
-- (20261111120000_security_fixes_invoke_secret_and_crm_notas_rls.sql): authenticated so' le,
-- escrita e' so' do service_role.
alter table gestao_crm.mensagens_rapidas enable row level security;

drop policy if exists "crm_mensagens_rapidas_select" on gestao_crm.mensagens_rapidas;
create policy "crm_mensagens_rapidas_select" on gestao_crm.mensagens_rapidas
for select to authenticated using (public.crm_has_access());

revoke insert, update, delete on gestao_crm.mensagens_rapidas from authenticated;
grant select on gestao_crm.mensagens_rapidas to authenticated;
grant select, insert, update, delete on gestao_crm.mensagens_rapidas to service_role;

-- Preserva as 4 respostas que ja existiam hardcoded no composer, pra ninguem perder o que ja
-- usava ao migrar para o cadastro novo.
insert into gestao_crm.mensagens_rapidas (titulo, texto) values
  ('Saudação', 'Olá! Em que posso ajudar?'),
  ('Horário de atendimento', 'Nosso horário de atendimento é de segunda a sábado, das 8h às 18h.'),
  ('Aguarde um momento', 'Só um momento, vou verificar essa informação para você.'),
  ('Encerramento', 'Fico à disposição! Qualquer outra dúvida, é só chamar por aqui.');

alter table gestao_crm.mensagens_rapidas replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'gestao_crm'
      and tablename = 'mensagens_rapidas'
  ) then
    alter publication supabase_realtime add table gestao_crm.mensagens_rapidas;
  end if;
end
$$;

notify pgrst, 'reload schema';
