-- Status de entrega/leitura de mensagens de atendimento (Fase 2, item 3 do roadmap de
-- Atendimento). Relevante so' para mensagens de saida (as que nos enviamos) -- o status de
-- entrega/leitura de uma mensagem de entrada do cliente nao existe do nosso lado. O webhook da
-- Meta ja manda esses eventos em value.statuses[] (sent/delivered/read/failed), mas hoje e'
-- totalmente ignorado em whatsapp-api/index.ts (so value.messages e' lido). Para casar o evento
-- de status com a linha certa em mensagens_atendimento, mensagens de saida precisam guardar o
-- whatsapp_message_id retornado pelo envio (ate agora so' mensagens de ENTRADA guardavam isso,
-- para dedupe) -- ver extractWhatsappMessageId em _shared/whatsapp.ts.
-- Evolution API: formato do evento de status ainda nao foi validado (ver card da Fase 0 /
-- apps/crm/CLAUDE.md) -- coluna existe para os dois provedores, mas so' a Meta atualiza por ora.

alter table gestao_crm.mensagens_atendimento
  add column if not exists status text not null default 'enviado'
    check (status in ('enviado', 'entregue', 'lido', 'falha')),
  add column if not exists status_atualizado_em timestamptz;

notify pgrst, 'reload schema';
