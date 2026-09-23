import { AppFooter } from '@macom/ui';

export default function App() {
  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-4xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
          MACOM App Template
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">
          Novo app React/Vite pronto para o monorepo
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          Renomeie esta pasta, ajuste o titulo, configure as rotas e adicione os scripts da raiz
          para publicar um novo sistema no mesmo padrao dos apps existentes.
        </p>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
              Passos iniciais
            </h2>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Copie `apps/_template` para `apps/seu-app`.</li>
              <li>2. Ajuste nome, manifest e telas.</li>
              <li>3. Adicione `dev:seu-app` e `build:seu-app` na raiz.</li>
            </ol>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wide text-foreground">
              Vercel
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Use `Root Directory = /`, `Build Command = npm run build:seu-app` e `Output Directory = apps/seu-app/dist`.
            </p>
          </div>
        </section>

        <AppFooter className="mt-10" />
      </div>
    </main>
  );
}
