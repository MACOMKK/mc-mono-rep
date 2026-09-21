import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Lock, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ThemeToggleButton,
} from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import { appVersion } from '@/lib/buildInfo';
import { servicosModules } from '@/lib/navigation';

const logoUrl = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';

function NavItem({ to, icon: Icon, label, collapsed, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? label : null}
    </NavLink>
  );
}

function ModuleNavItem({ mod, user, collapsed, onNavigate }) {
  const Icon = mod.icon;
  const location = useLocation();
  const visibleChildren = (mod.children ?? []).filter((child) => !child.requires || user?.[child.requires]);
  const hasChildren = visibleChildren.length > 0;
  const childActive = visibleChildren.some((child) => location.pathname.startsWith(child.path));
  const [open, setOpen] = useState(childActive);

  // Modulo real (declara `children`) mas o usuario perdeu acesso a todos eles -- some do menu por
  // completo, em vez de cair no fallback abaixo (que e' so pros modulos `comingSoon`, sem `children`).
  const definesChildren = Array.isArray(mod.children) && mod.children.length > 0;
  if (definesChildren && !hasChildren) {
    return null;
  }

  if (!hasChildren) {
    return (
      <NavLink
        to={mod.path}
        onClick={onNavigate}
        title={collapsed ? mod.label : undefined}
        aria-label={collapsed ? mod.label : undefined}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
            collapsed ? 'justify-center' : 'justify-between'
          } ${
            mod.comingSoon
              ? 'opacity-40 text-muted-foreground hover:bg-accent hover:opacity-60'
              : isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`
        }
      >
        <span className={`flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed ? mod.label : null}
        </span>
        {!collapsed && mod.comingSoon && <Lock className="h-3.5 w-3.5 shrink-0" />}
      </NavLink>
    );
  }

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={mod.label}
            aria-label={mod.label}
            className={`flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              childActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="min-w-[200px]">
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{mod.label}</div>
          {visibleChildren.map((child) => {
            const ChildIcon = child.icon;
            return (
              <DropdownMenuItem key={child.key} asChild>
                <NavLink
                  to={child.path}
                  onClick={onNavigate}
                  className={({ isActive }) => `flex items-center gap-2 ${isActive ? 'font-semibold text-foreground' : ''}`}
                >
                  <ChildIcon className="h-4 w-4 shrink-0" />
                  {child.label}
                </NavLink>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className={`flex flex-col gap-1 ${open ? 'mb-2' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
          childActive ? 'text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" />
          {mod.label}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
          {visibleChildren.map((child) => (
            <NavItem key={child.key} to={child.path} icon={child.icon} label={child.label} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, setMobileOpen, theme, toggleTheme }) {
  const { user } = useAuth();
  const closeMobile = () => setMobileOpen(false);
  // O drawer mobile nunca deve refletir o estado "recolhido" da sidebar desktop (persistido em
  // localStorage) -- senao o menu mobile abre so com o icone, sem "MACOM SERVICOS - vX".
  const effectiveCollapsed = collapsed && !mobileOpen;

  return (
    <>
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeMobile} />
      ) : null}

      <aside
        className={`
          no-print fixed top-0 left-0 z-50 flex h-full flex-col border-r border-border bg-card
          transition-all duration-300 ease-in-out
          ${effectiveCollapsed ? 'w-[88px]' : 'w-64'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className={`relative flex min-h-16 items-center border-b border-border pt-safe ${effectiveCollapsed ? 'justify-center px-3' : 'justify-between px-4'}`}>
          {!effectiveCollapsed ? (
            <div className="flex items-center gap-2 pl-1">
              <img src={logoUrl} alt="MACOM" className="h-8 w-8 object-contain" />
              <div className="flex flex-col leading-none">
                <h1 className="text-base font-extrabold leading-none tracking-tight text-foreground">MACOM</h1>
                <p className="mt-1 text-[10px] font-medium tracking-wider text-muted-foreground">
                  SERVIÇOS <span className="text-muted-foreground/60">· v{appVersion}</span>
                </p>
              </div>
            </div>
          ) : (
            <img src={logoUrl} alt="MACOM" className="mx-auto h-8 w-8 object-contain" />
          )}

          {!effectiveCollapsed ? (
            <div className="hidden items-center gap-1 lg:flex">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggle} title="Recolher sidebar">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={closeMobile}>
            <X className="h-4 w-4" />
          </Button>

          {effectiveCollapsed ? (
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

        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-4">
          <div className="flex flex-col gap-1">
            {servicosModules.map((mod) => (
              <ModuleNavItem key={mod.key} mod={mod} user={user} collapsed={effectiveCollapsed} onNavigate={closeMobile} />
            ))}
          </div>
        </nav>

        <div className="border-t border-border p-3">
          <ThemeToggleButton theme={theme} onToggle={toggleTheme} collapsed={effectiveCollapsed} />
        </div>
      </aside>
    </>
  );
}
