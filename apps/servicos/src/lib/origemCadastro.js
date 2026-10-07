// Labels de public.clientes/public.veiculos.origem_cadastro (ver
// supabase/migrations/20261007130000_add_origem_cadastro_cliente_veiculo.sql).
// 'desconhecida' nao tem label -- registros legados ficam sem badge, em vez de
// poluir a tela com "Desconhecida" em todo cadastro antigo.
export const ORIGEM_CADASTRO_LABEL = {
  crm_lead: 'CRM (lead)',
  crm_manual: 'CRM',
  servicos_manual: 'Oficina',
  importacao_lote: 'Importado',
};
