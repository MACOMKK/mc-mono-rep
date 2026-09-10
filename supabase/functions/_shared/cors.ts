const ALLOWED_ORIGINS = new Set([
  'https://macom-central.vercel.app',
  'https://macom-console.vercel.app',
  'https://macom-crm.vercel.app',
  'https://crm.mitmacom.com.br',
  'https://macom-intranet.vercel.app',
  'https://macom-relatorios.vercel.app',
  'https://macom-servicos.vercel.app',
  'https://macom-comunicacao.vercel.app',
  'https://chatmacom.vercel.app',
  'http://localhost:5170',
  'http://localhost:5171',
  'http://localhost:5172',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
  // Portas de `vite preview` (build de producao local) -- mesmo prefixo dos apps, trocando 51 por 41.
  'http://localhost:4170',
  'http://localhost:4171',
  'http://localhost:4172',
  'http://localhost:4174',
  'http://localhost:4175',
  'http://localhost:4176',
  'http://localhost:4177',
]);

export function buildCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}
