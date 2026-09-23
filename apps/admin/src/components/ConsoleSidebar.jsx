import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AppWindow,
  BookOpen,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Settings2,
  ShieldCheck,
  UsersRound,
  X,
} from 'lucide-react';
import { AppFooter, Button, ThemeToggleButton } from '@macom/ui';
import { useAuth } from '@macom/auth';

const LOGO_URL = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';

const navItems = [
  { path: '/', label: 'Visao geral', icon: LayoutDashboard },
  { path: '/sistemas', label: 'Sistemas', icon: AppWindow },
  { path: '/permissoes-sistemas', label: 'Permissoes', icon: ShieldCheck },
  { path: '/acessos-sistemas', label: 'Acessos', icon: KeyRound },
  { path: '/usuarios', label: 'Usuarios', icon: UsersRound },
  { path: '/auditoria', label: 'Auditoria', icon: Activity },
  { path: '/logs-acesso', label: 'Logs de acesso', icon: History },
  { path: '/integracoes', label: 'Integracoes', icon: Plug },
  { path: '/guia', label: 'Guia', icon: BookOpen },
  { path: '/configuracoes', label: 'Configuracoes', icon: Settings2 },
];

export default function ConsoleSidebar({ collapsed, onToggle, mobileOpen, setMobileOpen, theme, toggleTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, profile } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
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
              <img src={LOGO_URL} alt="MACOM" className="h-8 w-8 object-contain" />
              <div className="flex flex-col leading-none">
                <h1 className="text-base font-extrabold leading-none tracking-tight text-foreground">MACOM</h1>
                <p className="mt-1 text-[10px] font-medium tracking-wider text-muted-foreground">MACOM CONSOLE</p>
              </div>
            </div>
          ) : (
            <img src={LOGO_URL} alt="MACOM" className="mx-auto h-8 w-8 object-contain" />
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
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
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
          {!collapsed ? (
            <div className="mb-1 rounded-md bg-accent/50 px-3 py-2">
              <p className="truncate text-sm font-semibold">{profile?.nome || profile?.email || 'Usuario autenticado'}</p>
              <p className="truncate text-xs text-muted-foreground">{profile?.funcao || 'perfil ativo'}</p>
            </div>
          ) : null}
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
