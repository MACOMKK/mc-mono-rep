import { Home } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function PageNotFound() {
  const location = useLocation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md text-center">
        <p className="text-7xl font-light text-slate-300">404</p>
        <div className="mx-auto my-5 h-0.5 w-16 bg-primary" />
        <h1 className="text-2xl font-bold text-slate-800">Pagina nao encontrada</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          O endereco <span className="font-semibold text-slate-700">{location.pathname}</span> nao existe no CRM.
        </p>
        <Link
          to="/leads"
          className="mt-7 inline-flex h-10 items-center gap-2 bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          <Home className="h-4 w-4" />
          Voltar para Leads
        </Link>
      </div>
    </main>
  );
}
