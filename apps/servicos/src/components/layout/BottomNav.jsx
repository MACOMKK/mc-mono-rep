import { Menu } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

import { useAuth } from '@/lib/AuthContext';
import { servicosModules } from '@/lib/navigation';

// Barra fixa inferior, so mobile (lg:hidden) -- atalho pros itens mais usados do Financeiro
// (unico modulo implementado hoje) + botao "Mais" que abre a Sidebar (que ja funciona como
// drawer completo no mobile, ver Sidebar.jsx `mobileOpen`). Mesmo criterio de visibilidade dos
// filhos que a Sidebar usa (`child.requires`), pra nao divergir de quem ve o que.
const financeiro = servicosModules.find((mod) => mod.key === 'financeiro');

function getPrimaryItems(user) {
  const visiveis = (financeiro?.children ?? []).filter((child) => !child.requires || user?.[child.requires]);
  return visiveis.slice(0, 4);
}

export default function BottomNav({ onOpenMore }) {
  const location = useLocation();
  const { user } = useAuth();
  const primaryItems = getPrimaryItems(user);
  const isPrimaryActive = primaryItems.some((item) => location.pathname.startsWith(item.path));

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-safe will-change-transform [transform:translateZ(0)] lg:hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))` }}>
        {primaryItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <NavLink
              key={item.key}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-medium transition-colors ${
                isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={onOpenMore}
          className={`flex flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-medium transition-colors ${
            !isPrimaryActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
          }`}
        >
          <Menu className="h-5 w-5" />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
