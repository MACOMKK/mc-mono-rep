-- Card "Solicitar/enviar localização" do chat de Atendimento: mensagem de localizacao (enviada
-- pelo atendente, ou recebida do cliente -- seja voluntaria ou em resposta a um pedido) passa a
-- ter tipo_conteudo = 'localizacao'. Coordenadas/nome/endereco vao em
-- mensagens_atendimento.metadados->'location' (jsonb livre, mesmo padrao de 'whatsapp_message_id'
-- e 'responde_a') -- nao ganhou colunas proprias (lat/long) porque e' informacao exclusiva desse
-- tipo de mensagem, ao contrario de midia_url/midia_mime_type/midia_nome_arquivo, que todo
-- envio de midia usa.

alter table gestao_crm.mensagens_atendimento
  drop constraint if exists mensagens_atendimento_tipo_conteudo_check;

alter table gestao_crm.mensagens_atendimento
  add constraint mensagens_atendimento_tipo_conteudo_check
  check (tipo_conteudo in ('texto', 'imagem', 'audio', 'documento', 'localizacao'));

notify pgrst, 'reload schema';
