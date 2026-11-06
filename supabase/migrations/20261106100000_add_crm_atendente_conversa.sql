-- Card "Transferência de conversa entre atendentes" (Fase 1 do roadmap de Atendimento):
-- hoje não existe "atendente do chat" -- responsavel_id pertence ao lead, não à conversa, e
-- uma conversa sem lead vinculado não tem dono nenhum. atendente_id é independente do
-- responsavel_id do lead (um vendedor pode ser responsável pelo lead e outro atendente pode
-- estar tocando a conversa no momento). tipo em notas_conversa distingue nota manual do
-- registro automático gerado pela transferência (ver action transferir_atendimento).

alter table gestao_crm.conversas_atendimento
  add column if not exists atendente_id uuid references public.colaboradores(id);

create index if not exists idx_crm_conversas_atendimento_atendente_id
  on gestao_crm.conversas_atendimento(atendente_id);

alter table gestao_crm.notas_conversa
  add column if not exists tipo text not null default 'usuario';

alter table gestao_crm.notas_conversa
  drop constraint if exists notas_conversa_tipo_check;

alter table gestao_crm.notas_conversa
  add constraint notas_conversa_tipo_check check (tipo in ('usuario', 'sistema'));

notify pgrst, 'reload schema';
