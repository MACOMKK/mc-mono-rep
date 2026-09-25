-- Previa da ultima mensagem + flag de nao lida em gestao_crm.conversas_atendimento, usadas
-- pela lista de conversas do modulo Atendimento (ConversaListItem.jsx) para dar feedback
-- visual imediato de conversa com mensagem nova sem precisar abrir cada uma.

alter table gestao_crm.conversas_atendimento
  add column if not exists ultima_mensagem_preview text,
  add column if not exists nao_lida boolean not null default false;
