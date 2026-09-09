-- Etapa 2 de 2 da unificacao de classificacao de anexos (ver
-- 20260908130000_add_servicos_anexo_tipo_unificado.sql): remove as colunas antigas depois que o
-- backend/frontend ja foram atualizados pra ler/gravar so `tipo_anexo`. Nenhuma policy de RLS
-- referencia `categoria`/`tipo_documento` (as policies de anexos_solicitacao usam so
-- solicitante_id/status/criado_por), entao nao ha policy pra ajustar.

alter table gestao_servicos.anexos_solicitacao
  drop column if exists categoria,
  drop column if exists tipo_documento;

notify pgrst, 'reload schema';
