import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Archive, BriefcaseBusiness, Building2, FileText, Home, Landmark, Laptop, LogOut, Network, PanelLeftClose, PanelLeftOpen, Phone, Smartphone, Users, X } from 'lucide-react';
import { AppFooter, ThemeToggleButton } from '@macom/ui';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { CENTRAL_PERMISSION_LEVELS } from '@/lib/centralPermissions';

const routePrefetchers = {
  '/': () => import('@/pages/Dashboard'),
  '/ativos': () => import('@/pages/Assets'),
  '/departamentos': () => import('@/pages/Departments'),
  '/cargos': () => import('@/pages/Positions'),
  '/empresas': () => import('@/pages/Companies'),
  '/unidades': () => import('@/pages/Units'),
  '/colaboradores': () => import('@/pages/Collaborators'),
  '/contatos': () => import('@/pages/Contacts'),
  '/contratos-documentos': () => import('@/pages/ContractsDocuments'),
  '/linhas-corporativas': () => import('@/pages/CorporateLines'),
  '/infraestrutura': () => import('@/pages/Infrastructure'),
  '/termos-posse': () => import('@/pages/TermsPossession'),
};

const navItems = [
  { path: '/', label: 'Dashboard', icon: Home, module: 'dashboard' },
  { path: '/ativos', label: 'Ativos', icon: Laptop, module: 'ativos' },
  { path: '/departamentos', label: 'Departamentos', icon: Building2, module: 'departamentos' },
  { path: '/cargos', label: 'Cargos', icon: BriefcaseBusiness, module: 'cargos' },
  { path: '/empresas', label: 'Empresas', icon: Landmark, module: 'empresas' },
  { path: '/unidades', label: 'Unidades', icon: Building2, module: 'unidades' },
  { path: '/colaboradores', label: 'Colaboradores', icon: Users, module: 'colaboradores' },
  { path: '/contatos', label: 'Contatos', icon: Phone, module: 'contatos' },
  { path: '/contratos-documentos', label: 'Contratos e Documentos', icon: Archive, module: 'contratos_documentos' },
  { path: '/linhas-corporativas', label: 'Linhas Corporativas', icon: Smartphone, module: 'linhas_corporativas' },
  { path: '/infraestrutura', label: 'Infraestrutura', icon: Network, module: 'infra_estrutura' },
  { path: '/termos-posse', label: 'Termos de Posse', icon: FileText, module: 'termos_posse' },
];

export default function Sidebar({ collapsed, onToggle, mobileOpen, setMobileOpen, theme, toggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { canCentral, logout, profile } = useAuth();
  const logoUrl = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handlePrefetch = (path) => {
    routePrefetchers[path]?.().catch(() => null);
  };

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      ) : null}

      <aside
        className={`
          fixed top-0 left-0 z-50 flex h-full flex-col border-r border-border bg-card
          transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[88px]' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className={`relative flex h-16 items-center border-b border-border ${collapsed ? 'justify-center px-3' : 'justify-between px-4'}`}>
          {!collapsed ? (
            <div className="flex items-center gap-2 pl-1">
              <img src={logoUrl} alt="MACOM" className="h-8 w-8 object-contain" />
              <div className="flex flex-col leading-none">
                <h1 className="text-base font-extrabold leading-none tracking-tight text-foreground">MACOM</h1>
                <p className="mt-1 text-[10px] font-medium tracking-wider text-muted-foreground">CENTRAL MACOM</p>
              </div>
            </div>
          ) : (
            <img src={logoUrl} alt="MACOM" className="mx-auto h-8 w-8 object-contain" />
          )}

          {!collapsed ? (
            <Button variant="ghost" size="icon" className="hidden h-7 w-7 lg:flex" onClick={onToggle} title="Recolher sidebar">
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-4 w-4" />
          </Button>

          {collapsed ? (
            <button
              type="button"
              onClick={onToggle}
              className="absolute -right-3 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground lg:flex"
              title="Expandir sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-4">
          {navItems.filter((item) => {
            if (item.adminOnly) return profile?.funcao === 'admin';
            return canCentral?.(item.module, CENTRAL_PERMISSION_LEVELS.view);
          }).map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                onMouseEnter={() => handlePrefetch(item.path)}
                onFocus={() => handlePrefetch(item.path)}
                title={collapsed ? item.label : undefined}
                aria-label={collapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200
                  ${isActive ? 'bg-primary text-primary-foreground shadow-md' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed ? <span className="text-sm font-medium">{item.label}</span> : null}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} collapsed={collapsed} />
          <Button
            variant="outline"
            onClick={handleLogout}
            title={collapsed ? 'Sair' : undefined}
            aria-label={collapsed ? 'Sair' : undefined}
            className={`w-full gap-2 ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed ? <span>Sair</span> : null}
          </Button>
          {!collapsed ? (
            <AppFooter />
          ) : null}
        </div>
      </aside>
    </>
  );
}
