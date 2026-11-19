-- Pergunta de triagem de unidade no primeiro contato do WhatsApp (ver
-- supabase/functions/whatsapp-api/index.ts): quando chega mensagem de um telefone sem lead ativo,
-- o bot manda uma lista numerada de unidades e espera a resposta, criando o lead ja na unidade
-- escolhida. Precisa de estado persistido por conversa pra: (1) nunca re-perguntar depois de
-- resolvida/desistida, mesmo que a conversa seja reaberta meses depois; (2) interpretar a resposta
-- com a mesma numeracao que foi mostrada, mesmo que `public.unidades` mude nesse intervalo.
--
-- 3 colunas em vez de 1 jsonb "pendente" so: precisamos distinguir permanentemente "ja desisti de
-- perguntar" de "nunca perguntei" -- um campo que volta a null depois de resolver/desistir perderia
-- essa memoria e o telefone voltaria a ser perguntado a cada mensagem nova.

alter table gestao_crm.conversas_atendimento
  add column if not exists triagem_unidade_estado text
    check (triagem_unidade_estado in ('perguntado', 'resolvido', 'desistido')),
  add column if not exists triagem_unidade_opcoes jsonb,
  add column if not exists triagem_unidade_tentativas smallint not null default 0;

comment on column gestao_crm.conversas_atendimento.triagem_unidade_estado is
  'null = nunca avaliado nesta conversa (inclui conversas antigas, de antes desta feature). '
  'perguntado = pergunta enviada, aguardando resposta valida. '
  'resolvido = lead ativo existe (criado pela triagem ou que ja existia) -- nunca mais pergunta. '
  'desistido = respostas invalidas esgotaram as tentativas, ou nao havia unidade/config pra '
  'perguntar -- nunca mais pergunta automaticamente, fica para um atendente humano decidir.';

comment on column gestao_crm.conversas_atendimento.triagem_unidade_opcoes is
  'Snapshot {"opcoes":[{"numero":1,"unidade_id":"uuid","nome":"..."}]} fixado no momento do envio '
  'da pergunta (estado = perguntado). Nunca recalculado por nova consulta a public.unidades -- '
  'garante que a resposta do contato seja interpretada com a mesma numeracao que foi mostrada.';

comment on column gestao_crm.conversas_atendimento.triagem_unidade_tentativas is
  'Quantas vezes a pergunta ja foi reenviada por resposta invalida (maximo 1 reenvio antes de '
  'escalonar para atendente humano -- ver whatsapp-api/index.ts).';

notify pgrst, 'reload schema';
