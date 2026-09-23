import { Outlet } from 'react-router-dom';
import { AppFooter } from '@macom/ui';
import Navbar from '@/components/Navbar';
import { EmpresaProvider } from '@/context/EmpresaContext';
import { useCrmRealtime } from '@/hooks/useCrmRealtime';

export default function Layout() {
  const realtime = useCrmRealtime(true);

  return (
    <EmpresaProvider>
      <div className="min-h-screen bg-[#f4f4f4]">
        <Navbar realtime={realtime} />
        <main>
          <Outlet />
        </main>
        <AppFooter className="py-3" />
      </div>
    </EmpresaProvider>
  );
}
