import { Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandLoader, PasswordChangeForm } from '@macom/ui';
import PageNotFound from './lib/PageNotFound';
import ScrollToTop from './components/ScrollToTop';
import Layout from '@/components/Layout';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

const Clientes = lazy(() => import('@/pages/Clientes'));
const Eventos = lazy(() => import('@/pages/Eventos'));
const Leads = lazy(() => import('@/pages/Leads'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Login = lazy(() => import('@/pages/Login'));
const ConfiguracaoDistribuicao = lazy(() => import('@/pages/ConfiguracaoDistribuicao'));
const CategoriasVeiculo = lazy(() => import('@/pages/CategoriasVeiculo'));
const OrigensLead = lazy(() => import('@/pages/OrigensLead'));
const MotivosInsucesso = lazy(() => import('@/pages/MotivosInsucesso'));
const MotivosAndamento = lazy(() => import('@/pages/MotivosAndamento'));
const Pipelines = lazy(() => import('@/pages/Pipelines'));
const MarcasVeiculo = lazy(() => import('@/pages/MarcasVeiculo'));
const ModelosVeiculo = lazy(() => import('@/pages/ModelosVeiculo'));
const VersoesVeiculo = lazy(() => import('@/pages/VersoesVeiculo'));
const Estoque = lazy(() => import('@/pages/Estoque'));
const Propostas = lazy(() => import('@/pages/Propostas'));
const Atendimento = lazy(() => import('@/pages/Atendimento'));

const getFromPath = (search) => {
  const params = new URLSearchParams(search);
  const from = params.get('from');
  if (!from) return '/leads';

  try {
    const decoded = decodeURIComponent(from);
    return decoded.startsWith('/') ? decoded : '/leads';
  } catch {
    return '/leads';
  }
};

const LoadingScreen = () => <BrandLoader />;

const LoginRoute = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (!isLoadingAuth && isAuthenticated) {
    return <Navigate replace to={getFromPath(location.search)} />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Login loading={isLoadingAuth} />
    </Suspense>
  );
};

const CrmRoutes = () => {
  const { isAuthenticated, isLoadingAuth, mustChangePassword, changePassword } = useAuth();
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
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate replace to="/leads" />} />
          <Route path="/atividades" element={<Eventos />} />
          <Route path="/atendimentos" element={<Navigate replace to="/atividades" />} />
          <Route path="/atendimento" element={<Atendimento />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/configuracoes/distribuicao" element={<ConfiguracaoDistribuicao />} />
          <Route path="/configuracoes/categorias-veiculo" element={<CategoriasVeiculo />} />
          <Route path="/configuracoes/origens-lead" element={<OrigensLead />} />
          <Route path="/configuracoes/motivos-insucesso" element={<MotivosInsucesso />} />
          <Route path="/configuracoes/motivos-andamento" element={<MotivosAndamento />} />
          <Route path="/configuracoes/pipelines" element={<Pipelines />} />
          <Route path="/configuracoes/marcas-veiculo" element={<MarcasVeiculo />} />
          <Route path="/configuracoes/modelos-veiculo" element={<ModelosVeiculo />} />
          <Route path="/configuracoes/versoes-veiculo" element={<VersoesVeiculo />} />
          <Route path="/estoque" element={<Estoque />} />
          <Route path="/propostas" element={<Propostas />} />
        </Route>
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ScrollToTop />
          <Routes>
            <Route path="/entrar" element={<LoginRoute />} />
            <Route path="/login" element={<Navigate replace to="/entrar" />} />
            <Route path="*" element={<CrmRoutes />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
