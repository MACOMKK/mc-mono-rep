// Importacao unica do lote 1 (clientes_prontos_lote1.csv) para public.clientes /
// public.veiculos / public.veiculos_proprietarios. Ver plano em
// C:\Users\kevin\.claude\plans\magical-kindling-floyd.md para o desenho completo.
//
// Uso:
//   node scripts/importClientesLote1.mjs --dry-run --limit=20
//   node scripts/importClientesLote1.mjs --dry-run
//   node scripts/importClientesLote1.mjs
import fs from 'fs';
import postgres from 'postgres';

const CSV_PATH = 'C:\\Users\\kevin\\OneDrive\\clientes_prontos_lote1.csv';
const MARCA_PLACEHOLDER = 'OUTRAS MARCAS';
const CATEGORIA_PLACEHOLDER = 'OUTRAS MARCAS';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : null;

class DryRunRollback extends Error {}

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

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r\n|\n/).filter((l) => l.length > 0);
  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ';') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row = {};
    header.forEach((key, idx) => {
      row[key] = (values[idx] ?? '').trim();
    });
    return row;
  });
}

function onlyDigits(value) {
  return (value || '').replace(/\D/g, '');
}

function resolveTelefone(row) {
  const principal = onlyDigits(row.DDD_TELEFONE) + onlyDigits(row.TELEFONE);
  if (principal.length >= 10 && principal.length <= 11) return principal;
  const celular = onlyDigits(row.DDD_CELULAR) + onlyDigits(row.CELULAR);
  if (celular.length >= 10 && celular.length <= 11) return celular;
  return null;
}

function resolveEmail(row) {
  const email = (row.E_MAIL || '').trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function nullIfEmpty(value) {
  const v = (value || '').trim();
  return v ? v : null;
}

async function getOrCreateByUniqueName(sql, schema, table, nome) {
  const inserted = await sql.unsafe(
    `insert into ${schema}.${table} (nome) values ($1) on conflict (nome) do nothing returning id`,
    [nome],
  );
  if (inserted[0]) return inserted[0].id;
  const existing = await sql.unsafe(`select id from ${schema}.${table} where nome = $1 limit 1`, [nome]);
  return existing[0].id;
}

async function buildCatalog(sql, modelosDistintos) {
  // Catalogo (marca/categoria/modelo placeholder) e dado de referencia reutilizavel,
  // nao dado sensivel de teste -- fica sempre persistido (mesmo em --dry-run), senao
  // os inserts de public.veiculos (que SIM sao desfeitos em dry-run) quebrariam a FK
  // modelo_id contra um id que so existiu dentro de uma transacao ja revertida.
  //
  // Em lote (poucos round-trips): a latencia do pooler (us-west-2) torna 1 round-trip
  // por modelo inviavel (245 modelos x 2 queries cada ja estourou 180s num teste).
  const modeloIdByNome = new Map();
  await sql.begin(async (tx) => {
    const marcaId = await getOrCreateByUniqueName(tx, 'public', 'marcas_veiculo', MARCA_PLACEHOLDER);
    const categoriaId = await getOrCreateByUniqueName(tx, 'public', 'categorias_veiculo', CATEGORIA_PLACEHOLDER);

    const existentes = await tx`
      select id, nome from public.modelos_veiculo
      where marca_id = ${marcaId} and categoria_veiculo_id = ${categoriaId}
    `;
    for (const row of existentes) modeloIdByNome.set(row.nome, row.id);

    const faltantes = modelosDistintos.filter((nome) => !modeloIdByNome.has(nome));
    if (faltantes.length) {
      const linhas = faltantes.map((nome) => ({ marca_id: marcaId, categoria_veiculo_id: categoriaId, nome }));
      const criados = await tx`
        insert into public.modelos_veiculo ${tx(linhas, 'marca_id', 'categoria_veiculo_id', 'nome')}
        on conflict (marca_id, categoria_veiculo_id, nome) do nothing
        returning id, nome
      `;
      for (const row of criados) modeloIdByNome.set(row.nome, row.id);

      const aindaFaltando = faltantes.filter((nome) => !modeloIdByNome.has(nome));
      if (aindaFaltando.length) {
        const resolvidos = await tx`
          select id, nome from public.modelos_veiculo
          where marca_id = ${marcaId} and categoria_veiculo_id = ${categoriaId}
            and nome in ${tx(aindaFaltando)}
        `;
        for (const row of resolvidos) modeloIdByNome.set(row.nome, row.id);
      }
    }
  });
  return modeloIdByNome;
}

async function importCliente(sql, grupo, modeloIdByNome) {
  return sql.begin(async (tx) => {
    // statement_timeout/idle_in_transaction_session_timeout evitam que uma transacao
    // trave indefinidamente num hiccup de rede com o pooler (ja vimos isso acontecer).
    await tx.unsafe("set local statement_timeout = '15000'");
    await tx.unsafe("set local idle_in_transaction_session_timeout = '15000'");

    const { linhas } = grupo;
    const primeira = linhas[0];

    const telefone = resolveTelefone(primeira);
    if (!telefone) throw new Error('telefone invalido/ausente');

    const [clienteRow] = await tx`
      insert into public.clientes
        (nome, telefone, telefone_normalizado, email, email_normalizado, cpf_cnpj,
         endereco, bairro, municipio, uf, cep)
      values (
        ${primeira.NOME.trim()},
        ${telefone},
        ${telefone},
        ${resolveEmail(primeira)},
        ${resolveEmail(primeira)?.toLowerCase() ?? null},
        ${nullIfEmpty(primeira.CPF_CNPJ_NORMALIZADO)},
        ${nullIfEmpty(primeira.ENDERECO)},
        ${nullIfEmpty(primeira.BAIRRO)},
        ${nullIfEmpty(primeira.MUNICIPIO_NORMALIZADO)},
        ${nullIfEmpty(primeira.UF)},
        ${nullIfEmpty(primeira.CEP)}
      )
      returning id
    `;
    const clienteId = clienteRow.id;

    const chassisVistos = new Set();
    let veiculosInseridos = 0;
    for (const linha of linhas) {
      const chassi = linha.CHASSI.trim();
      if (!chassi || chassisVistos.has(chassi)) continue;
      chassisVistos.add(chassi);

      const modeloNome = linha.MODELO.trim();
      const modeloId = modeloIdByNome.get(modeloNome);
      if (!modeloId) throw new Error(`modelo sem id resolvido: "${modeloNome}"`);

      const ano = Number.parseInt(linha.ANO_MODELO, 10);

      const [veiculoRow] = await tx`
        insert into public.veiculos (modelo_id, chassi, placa, ano, cliente_atual_id)
        values (${modeloId}, ${chassi}, ${nullIfEmpty(linha.PLACA)}, ${Number.isFinite(ano) ? ano : null}, ${clienteId})
        returning id
      `;

      await tx`
        insert into public.veiculos_proprietarios (veiculo_id, cliente_id)
        values (${veiculoRow.id}, ${clienteId})
      `;
      veiculosInseridos += 1;
    }

    if (dryRun) {
      const rollback = new DryRunRollback();
      rollback.veiculosInseridos = veiculosInseridos;
      throw rollback;
    }
    return { veiculosInseridos };
  });
}

async function main() {
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
    const csvText = fs.readFileSync(CSV_PATH, 'utf8');
    const rows = parseCsv(csvText);

    const grupos = new Map();
    for (const row of rows) {
      const key = row.CLIENTE;
      if (!grupos.has(key)) grupos.set(key, { codigo: key, linhas: [] });
      grupos.get(key).linhas.push(row);
    }

    let gruposArray = Array.from(grupos.values());
    if (limit) gruposArray = gruposArray.slice(0, limit);

    const modelosDistintos = Array.from(new Set(rows.map((r) => r.MODELO.trim()).filter(Boolean)));
    console.log(`Catalogo: ${modelosDistintos.length} modelos distintos (marca/categoria placeholder "${MARCA_PLACEHOLDER}").`);
    const modeloIdByNome = await buildCatalog(sql, modelosDistintos);
    console.log(`Catalogo pronto (${modeloIdByNome.size} ids resolvidos).`);

    let clientesOk = 0;
    let veiculosOk = 0;
    const falhas = [];
    const total = gruposArray.length;
    const inicio = Date.now();

    for (let i = 0; i < total; i += 1) {
      const grupo = gruposArray[i];
      if ((i + 1) % 10 === 0) {
        console.log(`[cliente ${i + 1}/${total}] codigo=${grupo.codigo} iniciando...`);
      }
      try {
        const { veiculosInseridos } = await importCliente(sql, grupo, modeloIdByNome);
        clientesOk += 1;
        veiculosOk += veiculosInseridos;
      } catch (err) {
        if (err instanceof DryRunRollback) {
          clientesOk += 1;
          veiculosOk += err.veiculosInseridos || 0;
        } else {
          falhas.push({ codigo: grupo.codigo, nome: grupo.linhas[0].NOME, motivo: err.message });
        }
      }

      const processados = i + 1;
      if (processados % 50 === 0 || processados === total) {
        const segundos = (Date.now() - inicio) / 1000;
        const porCliente = segundos / processados;
        const restante = Math.round(porCliente * (total - processados));
        console.log(
          `[progresso] ${processados}/${total} (${((processados / total) * 100).toFixed(1)}%) `
          + `- ok=${clientesOk} falhas=${falhas.length} - ${segundos.toFixed(0)}s decorridos `
          + `- ~${restante}s restantes`,
        );
      }
    }

    console.log('--- resumo ---');
    console.log(`modo: ${dryRun ? 'DRY-RUN (nada foi gravado)' : 'REAL'}`);
    console.log(`clientes processados: ${gruposArray.length}`);
    console.log(`clientes OK: ${clientesOk}`);
    console.log(`veiculos OK: ${veiculosOk}`);
    console.log(`falhas: ${falhas.length}`);
    if (falhas.length) {
      console.log('--- detalhe das falhas ---');
      for (const f of falhas) {
        console.log(`[${f.codigo}] ${f.nome}: ${f.motivo}`);
      }
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((err) => {
  console.error('ERRO FATAL:', err);
  process.exit(1);
});
