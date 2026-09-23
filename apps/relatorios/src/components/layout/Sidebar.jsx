import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, MessageCircle, Mail, PanelLeftClose, PanelLeftOpen, Download } from 'lucide-react';
import { AppFooter, Spinner, Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@macom/ui';
import { useAuth } from '@/lib/AuthContext';
import { MACOM_LOGO_URL } from '@/config/branding';
import { useInstallPrompt } from '@/lib/useInstallPrompt';
import { getVisibleNavItems } from '@/lib/navigation';
import PasswordChangeDialog from './PasswordChangeDialog';

const routePrefetchers = {
  '/': () => import('@/pages/Dashboard'),
  '/relatorios': () => import('@/pages/admin/ManageReports'),
  '/unidades': () => import('@/pages/admin/ManageUnits'),
  '/permissoes': () => import('@/pages/admin/ManagePermissions'),
  '/acessos': () => import('@/pages/admin/Settings'),
  '/logs': () => import('@/pages/admin/AuditLogs'),
};

const prefetchLoginRoute = () => import('@/pages/Login');

export default function Sidebar({ user, collapsed, onToggle }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const location = useLocation();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const filteredItems = getVisibleNavItems(user);
  const supportItems = [
    {
      href: 'https://wa.me/5591983927903',
      icon: MessageCircle,
      label: 'WhatsApp',
      value: '(91) 98392-7903'
    },
    {
      href: 'mailto:kevinsoares@jcmempresas.com.br',
      icon: Mail,
      label: 'Email',
      value: 'kevinsoares@jcmempresas.com.br'
    }
  ];

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    void prefetchLoginRoute();

    try {
      await logout(false);
      navigate('/entrar', { replace: true });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handlePrefetch = (path) => {
    routePrefetchers[path]?.().catch(() => null);
  };

  return (
    <TooltipProvider delayDuration={0}>
      {isLoggingOut ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[2px]">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141414]/95 px-5 py-4 shadow-2xl">
            <Spinner className="text-white" />
            <span className="text-sm font-semibold tracking-wide text-white">Saindo...</span>
          </div>
        </div>
      ) : null}
      <aside
        className={`relative flex flex-col h-full transition-all duration-300 ${collapsed ? 'w-[88px]' : 'w-[240px]'}`}
        style={{ background: '#141414', borderRight: '1px solid #222' }}
      >
        <div
          className={`relative flex items-center h-16 border-b ${collapsed ? 'justify-center px-3' : 'justify-between px-4'}`}
          style={{ borderColor: '#222' }}
        >
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 pl-1'}`}>
            <img src={MACOM_LOGO_URL} alt="MACOM" className="w-10 h-9 object-cover flex-shrink-0" />
            {!collapsed && (
              <div className="flex flex-col leading-none">
                <span className="text-white font-black text-base tracking-widest uppercase">MACOM</span>
                <p className="mt-1 text-[10px] tracking-wider uppercase" style={{ color: '#E30613' }}>Portal BI</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md p-1.5 transition-colors"
              style={{ color: '#777' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#777'; }}
              title="Recolher sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}

          {collapsed && (
            <button
              type="button"
              onClick={onToggle}
              className="absolute -right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border shadow-md transition-colors"
              style={{ background: '#141414', borderColor: '#2b2b2b', color: '#777' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1b1b1b'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#141414'; e.currentTarget.style.color = '#777'; }}
              title="Expandir sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {filteredItems.map(item => {
            const isActive = location.pathname === item.path;
            const linkContent = (
              <Link
                key={item.path}
                to={item.path}
                onMouseEnter={() => handlePrefetch(item.path)}
                onFocus={() => handlePrefetch(item.path)}
                onTouchStart={() => handlePrefetch(item.path)}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-semibold uppercase tracking-wider transition-all duration-150 ${
                  collapsed ? 'justify-center' : ''
                }`}
                style={{
                  background: isActive ? '#E30613' : 'transparent',
                  color: isActive ? '#fff' : '#aaa',
                  borderLeft: isActive ? '3px solid #fff' : '3px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.background = '#222';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.color = '#aaa';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="text-xs">{item.label}</span>}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" className="font-bold uppercase tracking-wider text-xs">{item.label}</TooltipContent>
                </Tooltip>
              );
            }
            return linkContent;
          })}
        </nav>

        <div className="border-t p-3 space-y-2" style={{ borderColor: '#222' }}>
          {!collapsed && user && (
            <button
              onClick={() => setPasswordOpen(true)}
              className="w-full text-left flex items-center gap-2.5 px-2 py-2 rounded-sm transition-colors"
              onMouseEnter={e => { e.currentTarget.style.background = '#1b1b1b'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div
                className="w-8 h-8 flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                style={{ background: '#E30613' }}
              >
                {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold truncate text-white">{user.full_name || 'Usuario'}</p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: '#E30613' }}>{user.role || 'user'}</p>
                <p className="text-[9px] uppercase tracking-wider" style={{ color: '#777' }}>Alterar senha</p>
              </div>
            </button>
          )}

          {!collapsed && (
            <div className="px-2 py-1">
              <p className="text-[9px] uppercase tracking-widest font-bold mb-1.5" style={{ color: '#555' }}>
                Suporte
              </p>
              <div className="space-y-0.5">
                {supportItems.map(item => (
                  <a
                    key={item.label}
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 px-1 py-1 text-[10px] font-medium transition-colors"
                    style={{ color: '#aaa' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#aaa'; }}
                  >
                    <item.icon className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{item.value}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {collapsed &&
            supportItems.map(item => (
              <Tooltip key={item.label}>
                <TooltipTrigger asChild>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center py-2 transition-colors"
                    style={{ color: '#555' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
                  >
                    <item.icon className="w-4 h-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right" className="font-bold uppercase tracking-wider text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            ))}

          {collapsed && user && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPasswordOpen(true)}
                  className="w-full flex items-center justify-center py-2 transition-colors"
                  style={{ color: '#555' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
                >
                  <div
                    className="w-7 h-7 flex items-center justify-center text-[10px] font-black text-white"
                    style={{ background: '#E30613' }}
                  >
                    {user.full_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-bold uppercase tracking-wider text-xs">
                Alterar senha
              </TooltipContent>
            </Tooltip>
          )}

          {!collapsed && canInstall && (
            <button
              onClick={promptInstall}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{ color: '#555' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
            >
              <Download className="w-4 h-4" />
              Instalar app
            </button>
          )}

          {collapsed && canInstall && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={promptInstall}
                  className="w-full flex items-center justify-center py-2 transition-colors"
                  style={{ color: '#555' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
                >
                  <Download className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-bold uppercase tracking-wider text-xs">
                Instalar app
              </TooltipContent>
            </Tooltip>
          )}

          {!collapsed && (
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{ color: '#555' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#E30613'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
            >
              <LogOut className="w-4 h-4" />
              {isLoggingOut ? 'Saindo...' : 'Sair'}
            </button>
          )}

          {!collapsed && <AppFooter className="pt-1" />}
        </div>

        <PasswordChangeDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
      </aside>
    </TooltipProvider>
  );
}
