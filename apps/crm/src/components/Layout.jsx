import { Outlet, useLocation } from 'react-router-dom';
import { AppFooter } from '@macom/ui';
import Navbar from '@/components/Navbar';
import { EmpresaProvider } from '@/context/EmpresaContext';
import { useCrmRealtime } from '@/hooks/useCrmRealtime';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';

// Paginas "app shell" (ex.: Atendimento) preenchem exatamente a altura restante da viewport e
// rolam só internamente -- rodape embaixo de um chat full-height nao faz sentido.
const APP_SHELL_PATHS = ['/atendimento'];

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const isAppShell = APP_SHELL_PATHS.includes(location.pathname);
  const realtime = useCrmRealtime(true, {
    collaboratorId: user?.id || null,
    unitId: user?.unit_id || null,
    nivelAcesso: user?.system_access_level || null,
  });

  return (
    <EmpresaProvider>
      <div className="min-h-screen bg-[#f4f4f4]">
        <Navbar realtime={realtime} />
        <main className={cn(isAppShell && 'h-[calc(100vh-3.5rem)] overflow-hidden')}>
          <Outlet />
        </main>
        {isAppShell ? null : <AppFooter className="py-3" />}
      </div>
    </EmpresaProvider>
  );
}
