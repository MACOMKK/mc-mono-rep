-- Card "Tags de conversa" (Fase 1 do roadmap de Atendimento): troca as tags mockadas
-- (hash determinístico do id em ConversaListItem.jsx) por dado real, mesmo padrão de
-- gestao_crm.clientes_crm.tags (20261104100000_add_crm_avaliacoes_cliente_e_tags.sql), mas
-- aqui é tag da conversa em si (não do cliente) -- disponível mesmo sem vínculo a lead/cliente.

alter table gestao_crm.conversas_atendimento
  add column if not exists tags text[] not null default '{}';

notify pgrst, 'reload schema';
