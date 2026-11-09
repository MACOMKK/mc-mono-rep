-- Solicitacao recorrente (mensal) no Financeiro do servicos.
-- Quando uma solicitacao marcada como recorrente e paga, a servicos-api gera a ocorrencia do mes
-- seguinte com os mesmos dados, status 'rascunho' ("Aguardando valor") e valor vazio. O
-- solicitante informa o valor/boleto e envia (action enviar_rascunho): a solicitacao vira
-- 'pendente' e passa de novo pela aprovacao. Plano: apps/servicos/PLANO_RECORRENCIA_FINANCEIRO.md.

alter table gestao_servicos.solicitacoes_pagamento
  add column if not exists recorrente boolean not null default false,
  add column if not exists recorrencia_origem_id uuid
    references gestao_servicos.solicitacoes_pagamento(id) on delete set null,
  add column if not exists recorrencia_dia smallint;

alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists chk_servicos_solicitacoes_recorrencia_dia;
alter table gestao_servicos.solicitacoes_pagamento
  add constraint chk_servicos_solicitacoes_recorrencia_dia
  check (recorrencia_dia is null or recorrencia_dia between 1 and 31);

-- Solicitacao pessoal (lembrete fora da empresa) nunca e recorrente.
alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists chk_servicos_solicitacoes_recorrente_pessoal;
alter table gestao_servicos.solicitacoes_pagamento
  add constraint chk_servicos_solicitacoes_recorrente_pessoal
  check (not (recorrente and pessoal));

-- No maximo uma "proxima" por solicitacao (protege contra reverter o pagamento e pagar de novo).
create unique index if not exists uq_servicos_solicitacoes_recorrencia_origem
  on gestao_servicos.solicitacoes_pagamento (recorrencia_origem_id)
  where recorrencia_origem_id is not null;

-- Novo status 'rascunho'.
alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists solicitacoes_pagamento_status_check;
alter table gestao_servicos.solicitacoes_pagamento
  add constraint solicitacoes_pagamento_status_check
  check (status in ('rascunho', 'pendente', 'aprovado', 'reprovado', 'pago', 'cancelado'));

-- Valor pode ficar vazio apenas no rascunho. O check original (valor > 0) foi criado inline,
-- sem nome explicito -- localiza pelo catalogo para nao depender do nome gerado.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'gestao_servicos.solicitacoes_pagamento'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%valor > %'
      and pg_get_constraintdef(con.oid) not ilike '%status%'
  loop
    execute format('alter table gestao_servicos.solicitacoes_pagamento drop constraint %I', c.conname);
  end loop;
end $$;

alter table gestao_servicos.solicitacoes_pagamento
  alter column valor drop not null;

alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists chk_servicos_solicitacoes_valor;
alter table gestao_servicos.solicitacoes_pagamento
  add constraint chk_servicos_solicitacoes_valor
  check (status = 'rascunho' or (valor is not null and valor > 0));

create index if not exists idx_servicos_solicitacoes_recorrente
  on gestao_servicos.solicitacoes_pagamento (recorrente)
  where recorrente;

notify pgrst, 'reload schema';
