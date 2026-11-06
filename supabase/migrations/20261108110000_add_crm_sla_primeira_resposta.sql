-- Card "SLA de atendimento" (Fase 2 do roadmap de Atendimento): medir o tempo entre a mensagem
-- do cliente que fica pendente e a primeira resposta de um HUMANO (resposta automática da IA
-- nao conta pro SLA). O trigger fica em mensagens_atendimento (nao duplicado em whatsapp-api e
-- crm-api) porque toda mensagem, de qualquer origem, passa por um insert nessa tabela.

alter table gestao_crm.conversas_atendimento
  add column if not exists sla_primeira_resposta_em timestamptz,
  add column if not exists primeira_resposta_humana_em timestamptz;

create or replace function gestao_crm.crm_atualizar_sla_atendimento()
returns trigger as $$
begin
  if NEW.direcao = 'entrada' then
    -- So (re)inicia o relogio quando nao ha pendencia em aberto ainda: conversa nova
    -- (sla_primeira_resposta_em ainda null) ou pendencia anterior ja respondida por humano
    -- (primeira_resposta_humana_em not null). Se o cliente insistir antes de qualquer humano
    -- responder (sla_primeira_resposta_em setado e primeira_resposta_humana_em ainda null), a
    -- condicao abaixo nao casa e o relogio continua contando desde a primeira mensagem.
    update gestao_crm.conversas_atendimento
    set sla_primeira_resposta_em = now(),
        primeira_resposta_humana_em = null
    where id = NEW.conversa_id
      and (sla_primeira_resposta_em is null or primeira_resposta_humana_em is not null);
  elsif NEW.direcao = 'saida' and NEW.autor = 'humano' then
    update gestao_crm.conversas_atendimento
    set primeira_resposta_humana_em = now()
    where id = NEW.conversa_id
      and primeira_resposta_humana_em is null;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists trg_crm_mensagens_atendimento_sla on gestao_crm.mensagens_atendimento;
create trigger trg_crm_mensagens_atendimento_sla
after insert on gestao_crm.mensagens_atendimento
for each row
execute function gestao_crm.crm_atualizar_sla_atendimento();

notify pgrst, 'reload schema';
