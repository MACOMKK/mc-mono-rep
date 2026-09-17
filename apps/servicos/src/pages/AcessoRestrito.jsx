export default function AcessoRestrito({ modulo }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-destructive">Acesso restrito</span>
      <h2 className="text-xl font-bold">{modulo}</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Você não tem acesso liberado a este módulo. Fale com um administrador do SERVIÇOS para solicitar liberação.
      </p>
    </div>
  );
}
