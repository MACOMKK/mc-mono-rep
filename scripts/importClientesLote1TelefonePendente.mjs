// Reimportacao dos 10 clientes do lote 1 cujo telefone colidia com outro
// cliente ja existente no banco (idx unico telefone_normalizado).
// Verificado: 8 casos sao pessoa/CPF totalmente diferente (provavel erro de
// cadastro na base LINX, telefone de despachante/agente usado como fallback);
// 2 casos sao o SENAC, mas CNPJ/endereco de unidade fisica diferente. Nenhum
// e duplicata do cliente ja existente. Sem como saber o telefone real de
// nenhum dos dois lados, entao cada um recebe telefone ficticio = '00000' +
// codigo do cliente (igual ja feito para sem_telefone e telefone_invalido),
// a pedido do usuario.
// Os 2 casos SENAC (10326, 73264) tambem compartilham entre si o mesmo email
// (FISCAL@PA.SENAC.BR / fiscal@pa.senac.br, so muda caixa) -- que alem disso
// ja existe em outro cliente SENAC no banco (email_normalizado e unico). Por
// isso o email desses 2 fica vazio na importacao, igual ja foi feito para
// os 28 clientes do lote 1 que colidiam so por email.
//
// Uso:
//   node scripts/importClientesLote1TelefonePendente.mjs --dry-run
//   node scripts/importClientesLote1TelefonePendente.mjs
import fs from 'fs';
import postgres from 'postgres';

const CSV_PATH = 'C:\\Users\\kevin\\OneDrive\\clientes_fora_duplicados_lote1_telefone_pendente.csv';
const MARCA_PLACEHOLDER = 'OUTRAS MARCAS';
const CATEGORIA_PLACEHOLDER = 'OUTRAS MARCAS';
const ORIGEM_CADASTRO = 'importacao_lote';

// codigos cujo email colide (entre si e/ou com outro cliente ja existente) -- email fica vazio
const EMAIL_LIMPO_CODIGOS = new Set(['10326', '73264', '65665']);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

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

function resolveTelefoneFicticio(codigo) {
  return `00000${codigo}`;
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
    await tx.unsafe("set local statement_timeout = '15000'");
    await tx.unsafe("set local idle_in_transaction_session_timeout = '15000'");

    const { linhas, codigo } = grupo;
    const primeira = linhas[0];

    const telefone = resolveTelefoneFicticio(codigo);
    const email = EMAIL_LIMPO_CODIGOS.has(codigo) ? null : resolveEmail(primeira);

    const [clienteRow] = await tx`
      insert into public.clientes
        (nome, telefone, telefone_normalizado, email, email_normalizado, cpf_cnpj,
         cpf_cnpj_normalizado, endereco, bairro, municipio, uf, cep, origem_cadastro)
      values (
        ${primeira.NOME.trim()},
        ${telefone},
        ${telefone},
        ${email},
        ${email?.toLowerCase() ?? null},
        ${nullIfEmpty(primeira.CPF_CNPJ_NORMALIZADO)},
        ${nullIfEmpty(primeira.CPF_CNPJ_NORMALIZADO)},
        ${nullIfEmpty(primeira.ENDERECO)},
        ${nullIfEmpty(primeira.BAIRRO)},
        ${nullIfEmpty(primeira.MUNICIPIO_NORMALIZADO)},
        ${nullIfEmpty(primeira.UF)},
        ${nullIfEmpty(primeira.CEP)},
        ${ORIGEM_CADASTRO}
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
        insert into public.veiculos (modelo_id, chassi, placa, ano, cliente_atual_id, origem_cadastro)
        values (${modeloId}, ${chassi}, ${nullIfEmpty(linha.PLACA)}, ${Number.isFinite(ano) ? ano : null}, ${clienteId}, ${ORIGEM_CADASTRO})
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

    const gruposArray = Array.from(grupos.values());

    const modelosDistintos = Array.from(new Set(rows.map((r) => r.MODELO.trim()).filter(Boolean)));
    console.log(`Catalogo: ${modelosDistintos.length} modelos distintos (marca/categoria placeholder "${MARCA_PLACEHOLDER}").`);
    const modeloIdByNome = await buildCatalog(sql, modelosDistintos);
    console.log(`Catalogo pronto (${modeloIdByNome.size} ids resolvidos).`);

    let clientesOk = 0;
    let veiculosOk = 0;
    const falhas = [];

    for (const grupo of gruposArray) {
      try {
        const { veiculosInseridos } = await importCliente(sql, grupo, modeloIdByNome);
        clientesOk += 1;
        veiculosOk += veiculosInseridos;
        console.log(`[ok] codigo=${grupo.codigo} nome="${grupo.linhas[0].NOME}" telefone_ficticio=${resolveTelefoneFicticio(grupo.codigo)} veiculos=${veiculosInseridos}`);
      } catch (err) {
        if (err instanceof DryRunRollback) {
          clientesOk += 1;
          veiculosOk += err.veiculosInseridos || 0;
          console.log(`[dry-run ok] codigo=${grupo.codigo} nome="${grupo.linhas[0].NOME}" telefone_ficticio=${resolveTelefoneFicticio(grupo.codigo)} veiculos=${err.veiculosInseridos || 0}`);
        } else {
          falhas.push({ codigo: grupo.codigo, nome: grupo.linhas[0].NOME, motivo: err.message });
          console.log(`[falha] codigo=${grupo.codigo} nome="${grupo.linhas[0].NOME}" motivo=${err.message}`);
        }
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
