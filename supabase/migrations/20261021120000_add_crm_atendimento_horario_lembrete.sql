-- Horario opcional da atividade (ligacao) + controle de dedupe do lembrete automatico. A coluna
-- proximo_contato continua "date" (nao vira timestamptz) -- varios lugares do CRM
-- (EventoCard.jsx, Clientes.jsx, normalizeDateOnly) ja tratam ela como dia puro; horario_proximo_contato
-- e so usado pela Edge Function de lembrete (crm-atividades-lembrete-ligacao) para montar o instante
-- exato (proximo_contato + horario_proximo_contato).

alter table gestao_crm.atendimentos
  add column if not exists horario_proximo_contato time,
  add column if not exists lembrete_ligacao_enviado_em timestamptz;

-- Remarcar data/horario de uma atividade ainda planejada deve permitir que o lembrete dispare de
-- novo na nova janela -- sem isso, uma atividade empurrada pra frente nunca mais notificaria.
create or replace function gestao_crm.reset_lembrete_ligacao_on_reschedule()
returns trigger
language plpgsql
as $$
begin
  if new.lembrete_ligacao_enviado_em is not null
     and (
       new.proximo_contato is distinct from old.proximo_contato
       or new.horario_proximo_contato is distinct from old.horario_proximo_contato
     )
  then
    new.lembrete_ligacao_enviado_em := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_atendimentos_reset_lembrete_ligacao on gestao_crm.atendimentos;

create trigger trg_crm_atendimentos_reset_lembrete_ligacao
  before update on gestao_crm.atendimentos
  for each row
  execute function gestao_crm.reset_lembrete_ligacao_on_reschedule();

notify pgrst, 'reload schema';
