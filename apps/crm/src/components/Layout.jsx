import { Outlet } from 'react-router-dom';
import { AppFooter } from '@macom/ui';
import Navbar from '@/components/Navbar';
import { EmpresaProvider } from '@/context/EmpresaContext';
import { useCrmRealtime } from '@/hooks/useCrmRealtime';
import { useAuth } from '@/lib/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  const realtime = useCrmRealtime(true, {
    collaboratorId: user?.id || null,
    unitId: user?.unit_id || null,
    nivelAcesso: user?.system_access_level || null,
  });

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
