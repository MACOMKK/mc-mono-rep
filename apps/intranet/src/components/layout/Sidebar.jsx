import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import {
  BookOpen,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { AppFooter } from '@macom/ui';
import { cn } from '@/lib/utils';
import { canViewNavItem, intranetNavItems } from '@/lib/navigation';

export default function Sidebar({ collapsed = false, onToggle }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const logoUrl = 'https://res.cloudinary.com/drevbr5eq/image/upload/q_auto/f_auto/v1777603989/logo_vermelha_e2aob2.png';
  const visibleNavItems = intranetNavItems.filter((item) => canViewNavItem(item, user));

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-screen flex flex-col z-50 bg-sidebar text-sidebar-foreground transition-[width] duration-200',
        collapsed ? 'w-[88px]' : 'w-[240px]'
      )}
    >
      <div
        className={cn(
          'relative h-16 flex items-center border-b border-white/10',
          collapsed ? 'px-3 justify-center' : 'px-4 justify-between'
        )}
      >
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3 pl-1')}>
          <img src={logoUrl} alt="MACOM" className="h-8 w-8 shrink-0 object-contain" />
          {!collapsed && (
            <div className="flex flex-col leading-none">
              <span className="font-extrabold text-[0.98rem] tracking-tight text-white">MACOM</span>
              <span className="mt-1 text-[0.58rem] font-medium tracking-[0.2em] text-sidebar-foreground/80">INTRANET MACOM</span>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Recolher sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute -right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground/70 shadow-md transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            title="Expandir sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.path;
          const itemClassName = cn(
            'rounded-xl text-sm font-medium transition-all duration-200',
            collapsed ? 'flex items-center justify-center px-2 py-3' : 'flex items-center gap-3 px-4 py-2.5',
            isActive
              ? 'bg-sidebar-primary text-white shadow-lg shadow-sidebar-primary/20'
              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
          );

          return (
            <Link
              key={item.path}
              to={item.path}
              className={itemClassName}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <Link
              to="/guia"
              className={cn(
                'rounded-xl text-sm font-medium transition-all duration-200',
                collapsed ? 'flex items-center justify-center px-2 py-3' : 'flex items-center gap-3 px-4 py-2.5',
                location.pathname === '/guia'
                  ? 'bg-sidebar-primary text-white shadow-lg shadow-sidebar-primary/20'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )}
              title={collapsed ? 'Guia' : undefined}
            >
              <BookOpen className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span>Guia</span>}
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {!collapsed ? <AppFooter /> : null}
      </div>
    </aside>
  );
}

