// teste: Ignored Build Step Vercel (isolar deploys por app) — central
import { lazy, Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@macom/ui';

import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { CENTRAL_PERMISSION_LEVELS, CENTRAL_PERMISSION_MODULE_BY_PATH } from '@/lib/centralPermissions';
import PageNotFound from '@/lib/PageNotFound';
import { queryClientInstance } from '@/lib/query-client';

const Assets = lazy(() => import('@/pages/Assets'));
const Collaborators = lazy(() => import('@/pages/Collaborators'));
const Companies = lazy(() => import('@/pages/Companies'));
const Contacts = lazy(() => import('@/pages/Contacts'));
const ContractsDocuments = lazy(() => import('@/pages/ContractsDocuments'));
const CorporateLines = lazy(() => import('@/pages/CorporateLines'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Departments = lazy(() => import('@/pages/Departments'));
const Infrastructure = lazy(() => import('@/pages/Infrastructure'));
const Login = lazy(() => import('@/pages/Login'));
const Positions = lazy(() => import('@/pages/Positions'));
const TermsPossession = lazy(() => import('@/pages/TermsPossession'));
const Units = lazy(() => import('@/pages/Units'));

function RouteFallback() {
  return <PageLoader />;
}

function LoginRoute() {
  const { isAuthenticated, loading, login } = useAuth();

  if (loading) {
    return <Login onSubmit={login} loading />;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Login onSubmit={login} loading={false} />;
}

function CentralRoute({ children, adminOnly = false, moduleKey }) {
  const { canCentral, profile } = useAuth();

  if (adminOnly && profile?.funcao !== 'admin') {
    return <PageNotFound />;
  }

  if (moduleKey && !canCentral?.(moduleKey, CENTRAL_PERMISSION_LEVELS.view)) {
    return <PageNotFound />;
  }

  return children;
}

function withCentralPermission(path, element, options = {}) {
  return (
    <CentralRoute
      adminOnly={options.adminOnly}
      moduleKey={options.moduleKey || CENTRAL_PERMISSION_MODULE_BY_PATH[path]}
    >
      {element}
    </CentralRoute>
  );
}

export default function App() {
  return (
    <AuthProvider allowFunctionFallback={false}>
      <QueryClientProvider client={queryClientInstance}>
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <LoginRoute />
                </Suspense>
              }
            />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={withCentralPermission('/', <Dashboard />)} />
                <Route path="/ativos" element={withCentralPermission('/ativos', <Assets />)} />
                <Route path="/colaboradores" element={withCentralPermission('/colaboradores', <Collaborators />)} />
                <Route path="/contatos" element={withCentralPermission('/contatos', <Contacts />)} />
                <Route path="/contratos-documentos" element={withCentralPermission('/contratos-documentos', <ContractsDocuments />)} />
                <Route path="/linhas-corporativas" element={withCentralPermission('/linhas-corporativas', <CorporateLines />)} />
                <Route path="/departamentos" element={withCentralPermission('/departamentos', <Departments />)} />
                <Route path="/cargos" element={withCentralPermission('/cargos', <Positions />)} />
                <Route path="/empresas" element={withCentralPermission('/empresas', <Companies />)} />
                <Route path="/unidades" element={withCentralPermission('/unidades', <Units />)} />
                <Route path="/infraestrutura" element={withCentralPermission('/infraestrutura', <Infrastructure />)} />
                <Route path="/termos-posse" element={withCentralPermission('/termos-posse', <TermsPossession />)} />
                <Route path="*" element={<PageNotFound />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
