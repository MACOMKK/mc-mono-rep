import fs from 'fs';
import postgres from 'postgres';

function loadEnvLocal() {
  const raw = fs.readFileSync('.env.local', 'utf8');
  return Object.fromEntries(
    raw
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      }),
  );
}

const env = loadEnvLocal();
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const sql = postgres({
  host: 'aws-1-us-west-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  username: `postgres.${ref}`,
  password: env.SUPABASE_DB_PASSWORD,
  ssl: 'require',
  prepare: false,
  connect_timeout: 10,
});

try {
  const [clientes] = await sql`select count(*)::int as n from public.clientes`;
  const [veiculos] = await sql`select count(*)::int as n from public.veiculos`;
  const [props] = await sql`select count(*)::int as n from public.veiculos_proprietarios`;
  const [modelos] = await sql`
    select count(*)::int as n from public.modelos_veiculo m
    join public.marcas_veiculo ma on ma.id = m.marca_id
    where ma.nome = 'OUTRAS MARCAS'
  `;
  console.log('clientes:', clientes.n);
  console.log('veiculos:', veiculos.n);
  console.log('veiculos_proprietarios:', props.n);
  console.log('modelos_veiculo (OUTRAS MARCAS):', modelos.n);
} finally {
  await sql.end({ timeout: 1 });
}
