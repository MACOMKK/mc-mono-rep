-- Amplia o CHECK de gestao_servicos.anexos_solicitacao.tipo_anexo (ultima versao em
-- 20260914140000_add_servicos_anexo_tipos_extra.sql) com 2 tipos novos pedidos pelo Financeiro:
-- proposta (comercial) e ordem de servico (OS). So altera o CHECK -- nao mexe em dados existentes.

alter table gestao_servicos.anexos_solicitacao
  drop constraint anexos_solicitacao_tipo_anexo_check;

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
    'fatura',
    'contrato',
    'comprovante_abastecimento',
    'comprovante_hospedagem',
    'comprovante_passagem',
    'comprovante_pedagio',
    'conta_agua',
    'conta_energia',
    'conta_telefone',
    'folha_comissao',
    'comunicado_interno',
    'proposta',
    'ordem_servico',
    'outros'
  ));

notify pgrst, 'reload schema';
