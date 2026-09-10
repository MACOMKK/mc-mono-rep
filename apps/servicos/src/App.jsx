import { QueryClientProvider } from '@tanstack/react-query';
import { BrandLoader, PasswordChangeForm, Toaster } from '@macom/ui';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { queryClientInstance } from '@/lib/query-client';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { PushProvider } from '@/lib/PushContext';
import AppLayout from '@/components/layout/AppLayout';
import AppUpdatePrompt from '@/components/AppUpdatePrompt';
import NativeBackButtonHandler from '@/components/NativeBackButtonHandler';
import Login from '@/pages/Login';
import MinhasSolicitacoes from '@/pages/MinhasSolicitacoes';
import Aprovacoes from '@/pages/Aprovacoes';
import Pagamentos from '@/pages/Pagamentos';
import CalendarioVencimentos from '@/pages/CalendarioVencimentos';
import Fornecedores from '@/pages/Fornecedores';
import Categorias from '@/pages/Categorias';
import Relatorios from '@/pages/Relatorios';
import Configuracoes from '@/pages/Configuracoes';
import ModuloEmBreve from '@/pages/ModuloEmBreve';

const getFromPath = (search) => {
  const params = new URLSearchParams(search);
  const from = params.get('from');
  if (!from) return '/solicitacoes';

  try {
    const decoded = decodeURIComponent(from);
    return decoded.startsWith('/') ? decoded : '/solicitacoes';
  } catch {
    return '/solicitacoes';
  }
};

const LoadingScreen = () => <BrandLoader />;

const LoginRoute = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (!isLoadingAuth && isAuthenticated) {
    return <Navigate replace to={getFromPath(location.search)} />;
  }

  return <Login loading={isLoadingAuth} />;
};

const ServicosRoutes = () => {
  const { isAuthenticated, isLoadingAuth, user, mustChangePassword, changePassword } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    const from = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate replace to={`/entrar?from=${from}`} />;
  }

  if (mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <PasswordChangeForm required onSubmit={changePassword} />
      </div>
    );
  }

  return (
    <PushProvider>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate replace to="/solicitacoes" />} />
        <Route path="/solicitacoes" element={<MinhasSolicitacoes />} />
        {user?.isAprovador && <Route path="/aprovacoes" element={<Aprovacoes />} />}
        {user?.isPagador && <Route path="/pagamentos" element={<Pagamentos />} />}
        {user?.isPagador && <Route path="/calendario-vencimentos" element={<CalendarioVencimentos />} />}
        {user?.isFinanceiro && <Route path="/fornecedores" element={<Fornecedores />} />}
        {user?.isFinanceiro && <Route path="/categorias" element={<Categorias />} />}
        {user?.isFinanceiro && <Route path="/relatorios" element={<Relatorios />} />}
        {user?.system_access_level === 'admin' && <Route path="/configuracoes" element={<Configuracoes />} />}
        {user?.system_access_level === 'admin' && <Route path="/permissoes" element={<Navigate replace to="/configuracoes" />} />}
        <Route
          path="/atendimento"
          element={<ModuloEmBreve titulo="Atendimento" descricao="Recepcao de clientes, abertura de OS, agendamento e historico de veiculos." />}
        />
        <Route
          path="/oficina"
          element={<ModuloEmBreve titulo="Oficina" descricao="Servicos executados, mecanicos responsaveis, checklist e controle de pecas." />}
        />
        <Route
          path="/estoque"
          element={<ModuloEmBreve titulo="Estoque" descricao="Pecas, pneus, oleos e entradas/saidas." />}
        />
        <Route
          path="/compras"
          element={<ModuloEmBreve titulo="Compras" descricao="Solicitacao de compra, aprovacao e pedidos para fornecedores." />}
        />
        <Route
          path="/rh"
          element={<ModuloEmBreve titulo="RH" descricao="Funcionarios, ferias e reembolsos." />}
        />
        <Route path="*" element={<Navigate replace to="/solicitacoes" />} />
      </Route>
    </Routes>
    </PushProvider>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <NativeBackButtonHandler />
          <Routes>
            <Route path="/entrar" element={<LoginRoute />} />
            <Route path="/login" element={<Navigate replace to="/entrar" />} />
            <Route path="*" element={<ServicosRoutes />} />
          </Routes>
        </Router>
        <AppUpdatePrompt />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
