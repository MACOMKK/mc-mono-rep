-- Documentacao apenas (sem mudanca de comportamento). A regra de qual status de lead uma
-- mudanca dispara, e quando motivo_status_id/previsao_fechamento sao obrigatorios, existe
-- hoje replicada em tres lugares: prepare_lead_phase1() (leads), prepare_activity_business_state()
-- + apply_activity_outcome() (atendimentos) e apps/crm/src/lib/leadStatus.js (frontend).
--
-- Essa duplicacao ja causou um bug real: ver cabecalho de
-- 20260917000000_fix_activity_outcome_lead_status_requirements.sql, onde apply_activity_outcome()
-- ficou desatualizada em relacao a prepare_lead_phase1() por duas migrations.
--
-- Ate isso ser consolidado numa unica fonte de verdade, qualquer alteracao numa dessas funcoes
-- deve ser conferida contra as outras duas pontas e contra
-- apps/crm/src/test/leadStatus.rules.test.js (npm run test:crm:run).

comment on function gestao_crm.prepare_lead_phase1() is
  'Exige motivo_status_id para qualificado/convertido/perdido e previsao_fechamento para negociacao. '
  'Mantenha em sincronia com gestao_crm.apply_activity_outcome(), gestao_crm.prepare_activity_business_state() '
  'e apps/crm/src/lib/leadStatus.js (LEAD_STATUS_REQUIREMENTS). Teste: apps/crm/src/test/leadStatus.rules.test.js.';

comment on function gestao_crm.prepare_activity_business_state() is
  'Valida campos da atividade e exige motivo_status_id/previsao_fechamento conforme o resultado e o '
  'status atual do lead. Mantenha em sincronia com gestao_crm.prepare_lead_phase1() e '
  'apps/crm/src/lib/leadStatus.js (RESULTADO_LEAD_STATUS_TARGET, isLeadEligibleForResultado). '
  'Teste: apps/crm/src/test/leadStatus.rules.test.js.';

comment on function gestao_crm.apply_activity_outcome() is
  'Propaga a conclusao de uma atividade para gestao_crm.leads (status, motivo_status_id, '
  'previsao_fechamento), com elegibilidade guardada por WHERE status IN (...). Mantenha em sincronia '
  'com gestao_crm.prepare_lead_phase1() e apps/crm/src/lib/leadStatus.js (RESULTADO_LEAD_STATUS_TARGET, '
  'isLeadEligibleForResultado). Teste: apps/crm/src/test/leadStatus.rules.test.js.';
