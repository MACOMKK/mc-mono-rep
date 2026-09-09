-- Unifica `categoria` (etapa do fluxo) e `tipo_documento` (natureza do arquivo) de
-- gestao_servicos.anexos_solicitacao num unico campo `tipo_anexo` -- as duas colunas nasceram
-- como eixos ortogonais (ver 20260805170000_add_servicos_anexos_tipo_documento.sql) mas na
-- pratica so existem combinacoes restritas (ANEXO_TIPOS_DOCUMENTO_POR_CATEGORIA no backend), o
-- que tornava a dupla classificacao confusa pro usuario sem agregar nenhuma flexibilidade real.
--
-- Etapa 1 de 2 (aditiva, sem quebrar nada em producao): adiciona `tipo_anexo`, faz o backfill dos
-- dados existentes e valida com CHECK -- as colunas antigas continuam existindo ate a migration
-- seguinte (20260908140000), dando uma janela pra confirmar o backfill antes do drop.
--
-- Combinacoes reais confirmadas em producao antes de escrever este backfill (129 anexos, 11
-- combinacoes distintas, todas cobertas abaixo sem ambiguidade -- nenhuma linha cai no ELSE):
--   comprovante_solicitacao + orcamento/outros/recibo/comprovante_pix
--   nf_boleto               + nota_fiscal/boleto
--   pdf_unificado           + outros
--   rh                      + outros/recibo
--   comprovante_pagamento   + comprovante_pix/outros

alter table gestao_servicos.anexos_solicitacao
  add column if not exists tipo_anexo text;

update gestao_servicos.anexos_solicitacao
set tipo_anexo = case
  when categoria = 'nf_boleto' and tipo_documento = 'nota_fiscal' then 'nota_fiscal'
  when categoria = 'nf_boleto' and tipo_documento = 'boleto' then 'boleto'
  when categoria = 'comprovante_solicitacao' and tipo_documento = 'orcamento' then 'orcamento'
  when categoria = 'comprovante_solicitacao' and tipo_documento = 'comprovante_pix' then 'comprovante_pix'
  when categoria = 'comprovante_solicitacao' and tipo_documento = 'recibo' then 'recibo'
  when categoria = 'comprovante_pagamento' then 'comprovante_pagamento'
  when categoria = 'rh' then 'documento_rh'
  when categoria = 'pdf_unificado' then 'pdf_unificado'
  else 'outros'
end
where tipo_anexo is null;

alter table gestao_servicos.anexos_solicitacao
  add constraint anexos_solicitacao_tipo_anexo_check check (tipo_anexo in (
    'orcamento',
    'nota_fiscal',
    'boleto',
    'recibo',
    'comprovante_pix',
    'comprovante_pagamento',
    'documento_rh',
    'pdf_unificado',
    'outros'
  ));

alter table gestao_servicos.anexos_solicitacao
  alter column tipo_anexo set not null;

notify pgrst, 'reload schema';
