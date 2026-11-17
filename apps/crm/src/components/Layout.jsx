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
      {/* isAppShell usa 100dvh (nao 100vh) + flex-col, em vez de h-[calc(100vh-3.5rem)]: no
          mobile (Safari/Chrome), 100vh conta a altura SEM a barra de endereco/teclado, que e'
          maior que a area realmente visivel -- isso sobrava altura e forcava a pagina inteira a
          rolar, empurrando a navbar/cabecalho da conversa pra fora da tela por cima e deixando o
          composer desalinhado embaixo. dvh acompanha a viewport visivel de verdade. */}
      <div className={cn(isAppShell ? 'flex h-dvh flex-col overflow-hidden' : 'min-h-screen', 'bg-[#f4f4f4]')}>
        <Navbar realtime={realtime} />
        <main className={cn(isAppShell && 'min-h-0 flex-1 overflow-hidden')}>
          <Outlet />
        </main>
        {isAppShell ? null : <AppFooter className="py-3" />}
      </div>
    </EmpresaProvider>
  );
}
