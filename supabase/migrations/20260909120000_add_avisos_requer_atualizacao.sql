-- requer_atualizacao: quando true, aceitar o aviso recarrega a pagina do usuario (uso: avisar
-- sobre deploy novo sem depender de deteccao automatica via Service Worker -- o admin decide
-- manualmente quando notificar, criando/ativando um aviso com essa flag marcada).
alter table public.avisos
  add column if not exists requer_atualizacao boolean not null default false;
