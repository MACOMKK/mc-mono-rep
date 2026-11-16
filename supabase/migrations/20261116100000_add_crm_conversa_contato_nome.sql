-- Nome do contato tal como o proprio WhatsApp manda (profile.name da Meta / pushName da
-- Evolution) -- usado como fallback de exibicao quando a conversa ainda nao tem lead/cliente
-- vinculado (contato novo, so' telefone). Sem isso a lista de Atendimento mostrava so' o
-- numero de telefone para qualquer contato novo. Gravado pela whatsapp-api ao criar a
-- conversa (ou preenchido depois, se ainda nulo, a cada mensagem recebida).
alter table gestao_crm.conversas_atendimento
  add column if not exists contato_nome text;
