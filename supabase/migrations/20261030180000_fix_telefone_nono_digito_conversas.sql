-- Corrige telefone_normalizado de conversas_atendimento que chegaram via WhatsApp sem o 9o
-- digito do celular (DDI 55 + DDD + numero local de 8 digitos comecando em 6-9 -- formato
-- anterior a' resolucao Anatel 2016). Mesma logica agora aplicada em runtime por
-- normalizeBrazilianMobile (supabase/functions/whatsapp-api/index.ts); isso so corrige o que ja
-- ficou salvo errado antes do fix.
--
-- Como a correcao pode fazer duas linhas (uma ja certa, outra reconstruida) colidirem no mesmo
-- telefone_normalizado, repete a mesclagem de duplicatas (mesma logica da migration
-- 20261030173914_merge_duplicate_conversas_atendimento.sql) depois de corrigir os numeros.

update gestao_crm.conversas_atendimento
set telefone_normalizado = '55' || substring(telefone_normalizado from 3 for 2) || '9' || substring(telefone_normalizado from 5)
where telefone_normalizado ~ '^55[0-9]{2}[6-9][0-9]{7}$';

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
    update gestao_crm.mensagens_atendimento m
    set conversa_id = sobrevivente.id
    where m.conversa_id in (
      select id from gestao_crm.conversas_atendimento
      where telefone_normalizado = sobrevivente.telefone_normalizado
        and id <> sobrevivente.id
    );

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

    delete from gestao_crm.conversas_atendimento
    where telefone_normalizado = sobrevivente.telefone_normalizado
      and id <> sobrevivente.id;

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
