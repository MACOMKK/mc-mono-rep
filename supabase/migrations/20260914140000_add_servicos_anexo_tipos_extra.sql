-- Amplia o CHECK de gestao_servicos.anexos_solicitacao.tipo_anexo (criado em
-- 20260908130000_add_servicos_anexo_tipo_unificado.sql) com 11 tipos novos pedidos pelo
-- Financeiro, que ate aqui caiam todos em "outros": fatura, contrato, comprovantes de
-- abastecimento/hospedagem/passagem/pedagio, contas de agua/energia/telefone, folha de
-- comissao e comunicado interno. So altera o CHECK -- nao mexe em dados existentes.

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
    'outros'
  ));

notify pgrst, 'reload schema';
