-- Solicitacao pessoal: lembrete entre solicitante e aprovador de um pagamento que NAO e da
-- empresa (ex.: conta particular do aprovador). Nao passa por aprovacao nem pelo financeiro --
-- o proprio solicitante ou o aprovador destino dao baixa (action marcar_pago_pessoal da
-- servicos-api). Visivel SO pra esses dois: financeiro, contas_a_pagar, setor/unidade e admin
-- ficam de fora. Sem fornecedor/categoria (o favorecido e texto livre no snapshot `fornecedor`).

alter table gestao_servicos.solicitacoes_pagamento
  add column if not exists pessoal boolean not null default false;

-- Categoria continua obrigatoria para toda solicitacao que nao e pessoal.
alter table gestao_servicos.solicitacoes_pagamento
  alter column categoria_id drop not null;

alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists chk_servicos_solicitacoes_categoria;

alter table gestao_servicos.solicitacoes_pagamento
  add constraint chk_servicos_solicitacoes_categoria check (pessoal or categoria_id is not null);

-- Mesma regra de beneficiario de 20260831110000, com a excecao da pessoal (sem fornecedor nem
-- colaborador vinculado).
alter table gestao_servicos.solicitacoes_pagamento
  drop constraint if exists chk_servicos_solicitacoes_beneficiario;

alter table gestao_servicos.solicitacoes_pagamento
  add constraint chk_servicos_solicitacoes_beneficiario check (
    (pessoal and fornecedor_id is null and colaborador_beneficiario_id is null)
    or
    (not pessoal and tipo_beneficiario = 'fornecedor' and fornecedor_id is not null and colaborador_beneficiario_id is null)
    or
    (not pessoal and tipo_beneficiario = 'colaborador' and fornecedor_id is null)
  );

-- Defesa em profundidade (a edge function ja aplica a regra em canAccessSolicitacao e no WHERE
-- de `list`): policy RESTRICTIVE e combinada com AND sobre todas as policies permissivas, entao
-- nao precisa recriar servicos_can_access_solicitacao nem as policies dependentes. As tabelas
-- filhas (parcelas/anexos/historico) checam a solicitacao via `exists (select ... from
-- solicitacoes_pagamento)`, que tambem passa por esta policy -- ficam cobertas, inclusive o
-- Realtime (postgres_changes respeita RLS).
drop policy if exists "servicos_solicitacoes_pessoal_restrita" on gestao_servicos.solicitacoes_pagamento;
create policy "servicos_solicitacoes_pessoal_restrita" on gestao_servicos.solicitacoes_pagamento
as restrictive
for all to authenticated
using (
  not pessoal
  or solicitante_id = public.current_colaborador_id()
  or aprovador_destino_id = public.current_colaborador_id()
)
with check (
  not pessoal
  or solicitante_id = public.current_colaborador_id()
  or aprovador_destino_id = public.current_colaborador_id()
);
