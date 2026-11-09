-- Fase 3, card "Receber mídia (imagem/áudio/documento)" do roadmap de Atendimento. Hoje
-- mensagens_atendimento só guarda texto (conteudo) -- mídia recebida via webhook (Meta ou
-- Evolution) é descartada silenciosamente (ver extractIncomingMessagesMeta/Evolution em
-- whatsapp-api/index.ts, que só lêem message.text.body / message.conversation).

alter table gestao_crm.mensagens_atendimento
  add column if not exists tipo_conteudo text not null default 'texto'
    check (tipo_conteudo in ('texto', 'imagem', 'audio', 'documento')),
  add column if not exists midia_url text,
  add column if not exists midia_mime_type text,
  add column if not exists midia_nome_arquivo text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('crm-atendimento-midia', 'crm-atendimento-midia', true, 26214400)
on conflict (id) do update
set public = true,
    file_size_limit = 26214400;

-- Upload é feito só pela whatsapp-api/crm-api (service role, bypassa RLS) -- aqui só precisa de
-- policy de leitura pra quem tem acesso ao sistema crm (mesmo padrão de avisos/avatares da
-- intranet). Bucket público: a url pública já serve o arquivo sem policy, mas a policy de select
-- ainda é necessária para operações autenticadas no painel (list/getPublicUrl com RLS ativo).
drop policy if exists "storage_crm_atendimento_midia_read" on storage.objects;
create policy "storage_crm_atendimento_midia_read"
on storage.objects
for select
to authenticated
using (bucket_id = 'crm-atendimento-midia' and public.has_system_access('crm'));

notify pgrst, 'reload schema';
