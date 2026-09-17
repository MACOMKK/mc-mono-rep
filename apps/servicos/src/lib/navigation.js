import { Banknote, BarChart3, Building2, CalendarDays, CheckCircle2, ClipboardCheck, Package, Phone, Receipt, ShoppingCart, Tag, UsersRound, Wrench } from 'lucide-react';

// Módulos do sistema SERVIÇOS. Só "financeiro" está implementado hoje (era o app pagamentos);
// os demais aparecem no menu como "em breve" até ganharem backend/telas próprias.
// `children` é opcional: um módulo com filhos vira um submenu expansível no Layout;
// `requires` num filho condiciona a exibição a `user?.[requires]`.
export const servicosModules = [
  { key: 'atendimento', label: 'Atendimento', icon: Phone, path: '/atendimento', comingSoon: true },
  {
    key: 'oficina',
    label: 'Oficina',
    icon: Wrench,
    path: '/oficina/checklists',
    comingSoon: false,
    children: [
      { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, path: '/oficina/checklists', requires: 'hasOficinaAccess' },
    ],
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    icon: Banknote,
    path: '/solicitacoes',
    comingSoon: false,
    children: [
      { key: 'minhas-solicitacoes', label: 'Solicitações', icon: Receipt, path: '/solicitacoes', requires: 'hasFinanceiroAccess' },
      { key: 'aprovacoes', label: 'Aprovações', icon: CheckCircle2, path: '/aprovacoes', requires: 'isAprovador' },
      { key: 'pagamentos', label: 'Contas a pagar', icon: Receipt, path: '/pagamentos', requires: 'isPagador' },
      { key: 'calendario-vencimentos', label: 'Calendário', icon: CalendarDays, path: '/calendario-vencimentos', requires: 'isPagador' },
      { key: 'fornecedores', label: 'Fornecedores', icon: Building2, path: '/fornecedores', requires: 'isFinanceiro' },
      { key: 'categorias', label: 'Categorias', icon: Tag, path: '/categorias', requires: 'isFinanceiro' },
      { key: 'relatorios', label: 'Relatórios', icon: BarChart3, path: '/relatorios', requires: 'isFinanceiro' },
    ],
  },
  { key: 'estoque', label: 'Estoque', icon: Package, path: '/estoque', comingSoon: true },
  { key: 'compras', label: 'Compras', icon: ShoppingCart, path: '/compras', comingSoon: true },
  { key: 'rh', label: 'RH', icon: UsersRound, path: '/rh', comingSoon: true },
];
