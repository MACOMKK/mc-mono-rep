-- Mescla conversas_atendimento duplicadas (mesmo telefone_normalizado) geradas pelo bug em que
-- uma nova mensagem de um telefone com a unica conversa "encerrada" criava uma conversa nova em
-- vez de reabrir a existente. A partir de agora whatsapp-api reabre a conversa encerrada (ver
-- supabase/functions/whatsapp-api/index.ts), entao isso so limpa o que ja ficou duplicado.

do $$
declare
  sobrevivente record;
begin
  for sobrevivente in
    select distinct on (telefone_normalizado)
      id,
      telefone_normalizado
    from gestao_crm.conversas_atendimento
    order by telefone_normalizado, ultima_mensagem_em desc nulls last, criado_em desc
  loop
    -- Reatribui as mensagens das conversas descartadas (mesmo telefone, id diferente do
    -- sobrevivente) para a conversa sobrevivente.
    update gestao_crm.mensagens_atendimento m
    set conversa_id = sobrevivente.id
    where m.conversa_id in (
      select id from gestao_crm.conversas_atendimento
      where telefone_normalizado = sobrevivente.telefone_normalizado
        and id <> sobrevivente.id
    );

    -- Preenche cliente_id/lead_id da sobrevivente com o valor de alguma descartada, se a
    -- sobrevivente estiver nula nesses campos.
    update gestao_crm.conversas_atendimento s
    set cliente_id = coalesce(s.cliente_id, d.cliente_id),
        lead_id = coalesce(s.lead_id, d.lead_id)
    from (
      select cliente_id, lead_id
      from gestao_crm.conversas_atendimento
      where telefone_normalizado = sobrevivente.telefone_normalizado
        and id <> sobrevivente.id
      limit 1
    ) d
    where s.id = sobrevivente.id;

    -- Se alguma descartada estava aberta/aguardando_humano, a sobrevivente nao pode ficar
    -- "encerrada" -- ainda ha atendimento em aberto daquele telefone.
    update gestao_crm.conversas_atendimento s
    set status = 'aberta'
    where s.id = sobrevivente.id
      and s.status = 'encerrada'
      and exists (
        select 1 from gestao_crm.conversas_atendimento
        where telefone_normalizado = sobrevivente.telefone_normalizado
          and id <> sobrevivente.id
          and status <> 'encerrada'
      );

    -- Apaga as conversas descartadas (mensagens ja foram movidas acima).
    delete from gestao_crm.conversas_atendimento
    where telefone_normalizado = sobrevivente.telefone_normalizado
      and id <> sobrevivente.id;

    -- Recalcula ultima_mensagem_em/preview/nao_lida da sobrevivente a partir do historico
    -- de mensagens ja consolidado (cobre o caso de a sobrevivente escolhida nao ter sido a
    -- dona original da mensagem mais recente).
    update gestao_crm.conversas_atendimento s
    set ultima_mensagem_em = ult.criado_em,
        ultima_mensagem_preview = left(ult.conteudo, 140)
    from (
      select conteudo, criado_em
      from gestao_crm.mensagens_atendimento
      where conversa_id = sobrevivente.id
      order by criado_em desc
      limit 1
    ) ult
    where s.id = sobrevivente.id;
  end loop;
end $$;
