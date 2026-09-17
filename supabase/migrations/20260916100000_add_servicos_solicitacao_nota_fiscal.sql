alter table gestao_servicos.solicitacoes_pagamento
  add column if not exists possui_nota_fiscal boolean not null default false;

comment on column gestao_servicos.solicitacoes_pagamento.possui_nota_fiscal is
  'Indica se o solicitante espera anexar nota fiscal para esta solicitacao (pode ser ate a data de pagamento). Usado pelo financeiro para identificar de antemao pagamentos que nao terao NF (reembolso, suprimento de caixa, etc).';
