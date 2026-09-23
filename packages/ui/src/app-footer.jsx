// Rodape de credito compartilhado entre apps: nome da organizacao (branding, pode variar por
// cliente/fork) + autoria (fixa). Presentational, sem fetch.
export function AppFooter({ orgName = 'MACOM Mitsubishi', className = '' }) {
  const year = new Date().getFullYear();
  return (
    <p className={`text-center text-[10px] text-muted-foreground ${className}`}>
      {orgName} © {year} · desenvolvido por Kevin Kley & Gabriel Xavier
    </p>
  );
}
