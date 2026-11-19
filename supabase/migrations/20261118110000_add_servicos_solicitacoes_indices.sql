-- Indices faltantes em gestao_servicos.solicitacoes_pagamento: departamento_id, aprovador_destino_id
-- e empresa_id sao usados nos filtros de `list`/`relatorio_financeiro` (servicos-api) sem indice
-- proprio ate aqui. forma_pagamento/pessoal sao baixa cardinalidade e sempre filtrados com
-- `where forma_pagamento = 'dinheiro'`/`where pessoal`, por isso usam indice parcial em vez de um
-- B-tree completo na coluna.
create index if not exists idx_servicos_solicitacoes_departamento_id
  on gestao_servicos.solicitacoes_pagamento (departamento_id);

create index if not exists idx_servicos_solicitacoes_aprovador_destino_id
  on gestao_servicos.solicitacoes_pagamento (aprovador_destino_id);

create index if not exists idx_servicos_solicitacoes_empresa_id
  on gestao_servicos.solicitacoes_pagamento (empresa_id);

create index if not exists idx_servicos_solicitacoes_dinheiro
  on gestao_servicos.solicitacoes_pagamento (id) where forma_pagamento = 'dinheiro';

create index if not exists idx_servicos_solicitacoes_pessoal
  on gestao_servicos.solicitacoes_pagamento (id) where pessoal = true;
