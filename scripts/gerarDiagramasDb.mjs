// Gera diagramas ER (Mermaid) do banco a partir de supabase/migrations.
// Reconstrói o estado final de tabelas/colunas/FKs aplicando as migrations em ordem
// (create/alter/rename/set schema/drop). Tabelas criadas só no baseline remoto
// (migrations placeholder) aparecem parcialmente: id + colunas vindas de alters.
//
// Uso: npm run docs:db  ->  escreve docs/db/*.md e docs/db/model.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');
const outDir = path.join(root, 'docs', 'db');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

const tables = new Map(); // key "schema.name" -> table
const warnings = [];

const key = (s, n) => `${s}.${n}`;
const clean = (id) => id.replace(/"/g, '').trim();

function qual(ref) {
  const r = clean(ref);
  return r.includes('.') ? r.split('.') : ['public', r];
}

function getTable(s, n, external = false) {
  let t = tables.get(key(s, n));
  if (!t) {
    t = { schema: s, name: n, columns: [], pk: [], fks: [], external, file: null };
    tables.set(key(s, n), t);
  }
  return t;
}

function splitTop(body, sep = ',') {
  const parts = [];
  let depth = 0, cur = '', q = false;
  for (const ch of body) {
    if (ch === "'") q = !q;
    if (!q) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const REF_RE = /references\s+([\w."]+)\s*(?:\(([^)]*)\))?(?:.*?on delete (cascade|set null|restrict|no action|set default))?/;

function addFk(t, cols, refStr, colsRef, onDelete, name) {
  const [rs, rn] = qual(refStr);
  const target = tables.get(key(rs, rn)) || getTable(rs, rn, true);
  const fkName = name || `${t.name}_${cols.join('_')}_fkey`;
  t.fks = t.fks.filter((f) => f.name !== fkName);
  t.fks.push({ name: fkName, columns: cols, target, targetColumns: colsRef ? colsRef.split(',').map(clean) : ['id'], onDelete: onDelete || 'no action' });
}

function parseColumnDef(t, def) {
  const m = def.match(/^("?[\w]+"?)\s+(.+)$/s);
  if (!m) return;
  const name = clean(m[1]);
  const rest = m[2];
  const typeM = rest.match(/^([\w]+(?:\s+(?:with(?:out)? time zone|precision|varying))?(?:\s*\([^)]*\))?(?:\[\])?)/);
  const type = typeM ? typeM[1] : rest.split(/\s/)[0];
  const notNull = /not null/.test(rest) || /primary key/.test(rest);
  const col = { name, type, notNull, unique: /\bunique\b/.test(rest) };
  t.columns = t.columns.filter((c) => c.name !== name);
  t.columns.push(col);
  if (/primary key/.test(rest)) t.pk = [name];
  const r = rest.match(REF_RE);
  if (r) addFk(t, [name], r[1], r[2], r[3]);
}

function parseTableConstraint(t, def) {
  let name = null;
  const cn = def.match(/^constraint\s+("?[\w]+"?)\s+(.*)$/s);
  if (cn) { name = clean(cn[1]); def = cn[2]; }
  const pk = def.match(/^primary key\s*\(([^)]*)\)/);
  if (pk) { t.pk = pk[1].split(',').map(clean); return true; }
  const fk = def.match(/^foreign key\s*\(([^)]*)\)\s*(references.*)$/s);
  if (fk) {
    const r = fk[2].match(REF_RE);
    if (r) addFk(t, fk[1].split(',').map(clean), r[1], r[2], r[3], name);
    return true;
  }
  return /^(unique|check|exclude)/.test(def);
}

function renameColumnEverywhere(t, from, to) {
  for (const c of t.columns) if (c.name === from) c.name = to;
  t.pk = t.pk.map((c) => (c === from ? to : c));
  for (const f of t.fks) f.columns = f.columns.map((c) => (c === from ? to : c));
  for (const o of tables.values()) for (const f of o.fks) if (f.target === t) f.targetColumns = f.targetColumns.map((c) => (c === from ? to : c));
}

function moveTable(t, s, n) {
  if (tables.has(key(s, n))) return;
  tables.delete(key(t.schema, t.name));
  t.schema = s; t.name = n;
  tables.set(key(s, n), t);
}

function dropTable(s, n) {
  const t = tables.get(key(s, n));
  if (!t) return;
  tables.delete(key(s, n));
  for (const o of tables.values()) o.fks = o.fks.filter((f) => f.target !== t);
}

function handle(stmt, file) {
  let m;
  if ((m = stmt.match(/^alter schema ("?\w+"?) rename to ("?\w+"?)$/))) {
    const from = clean(m[1]), to = clean(m[2]);
    for (const t of [...tables.values()]) if (t.schema === from) moveTable(t, to, t.name);
    return;
  }
  if ((m = stmt.match(/^create table (?:if not exists )?([\w."]+)\s*\((.*)\)[^)]*$/s))) {
    const [s, n] = qual(m[1]);
    if (tables.has(key(s, n)) && !tables.get(key(s, n)).external) return;
    const t = getTable(s, n);
    t.external = false; t.file = file;
    for (const def of splitTop(m[2])) {
      if (!parseTableConstraint(t, def)) parseColumnDef(t, def);
    }
    return;
  }
  if ((m = stmt.match(/^drop table (?:if exists )?(.+?)(?: cascade| restrict)?$/s))) {
    for (const ref of m[1].split(',')) dropTable(...qual(ref));
    return;
  }
  if ((m = stmt.match(/^alter table (?:if exists )?(?:only )?([\w."]+)\s+(.*)$/s))) {
    const [s, n] = qual(m[1]);
    let t = tables.get(key(s, n));
    if (!t || t.external) {
      // Tabela criada no baseline remoto (migrations placeholder): conhecida só pelos alters.
      if (s !== 'public') return;
      t = getTable(s, n);
      t.external = false; t.baseline = true; t.file = file;
      if (!t.columns.length) { t.columns.push({ name: 'id', type: 'uuid', notNull: true }); t.pk = ['id']; }
    }
    let a;
    const action = m[2];
    if ((a = action.match(/^rename to ("?\w+"?)$/))) return moveTable(t, s, clean(a[1]));
    if ((a = action.match(/^set schema ("?\w+"?)$/))) return moveTable(t, clean(a[1]), n);
    if ((a = action.match(/^rename (?:column )?("?\w+"?) to ("?\w+"?)$/))) return renameColumnEverywhere(t, clean(a[1]), clean(a[2]));
    for (const part of splitTop(action)) {
      if ((a = part.match(/^add column (?:if not exists )?(.*)$/s))) parseColumnDef(t, a[1]);
      else if ((a = part.match(/^drop column (?:if exists )?("?\w+"?)/))) {
        const c = clean(a[1]);
        t.columns = t.columns.filter((x) => x.name !== c);
        t.fks = t.fks.filter((f) => !f.columns.includes(c));
      } else if ((a = part.match(/^drop constraint (?:if exists )?("?\w+"?)/))) {
        const c = clean(a[1]);
        t.fks = t.fks.filter((f) => f.name !== c);
      } else if ((a = part.match(/^add (constraint .*|foreign key.*|primary key.*)$/s))) parseTableConstraint(t, a[1]);
      else if ((a = part.match(/^alter column ("?\w+"?) (set|drop) not null/))) {
        const col = t.columns.find((x) => x.name === clean(a[1]));
        if (col) col.notNull = a[2] === 'set';
      } else if ((a = part.match(/^alter column ("?\w+"?) (?:set data )?type ([\w ]+(?:\([^)]*\))?)/))) {
        const col = t.columns.find((x) => x.name === clean(a[1]));
        if (col) col.type = a[2].replace(/ using.*/, '').trim();
      }
    }
  }
}

function seedBaseline(n, extra = []) {
  const t = getTable('public', n);
  t.baseline = true; t.file = 'baseline remoto';
  t.columns.push({ name: 'id', type: 'uuid', notNull: true }); t.pk = ['id'];
  for (const [c, ref] of extra) { t.columns.push({ name: c, type: 'uuid', notNull: false }); addFk(t, [c], ref); }
}
seedBaseline('departamentos');
seedBaseline('unidades');
seedBaseline('perfis', [['departamento_id', 'public.departamentos'], ['unidade_id', 'public.unidades']]);
addFk(tables.get('public.perfis'), ['id'], 'auth.users');

for (const f of files) {
  let sql = fs.readFileSync(path.join(dir, f), 'utf8');
  sql = sql.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Desembrulha blocos DO/funções: statements dentro deles (renomeações condicionais) também contam.
  sql = sql.replace(/\$[\w]*\$/g, ';');
  for (let stmt of sql.split(';')) {
    stmt = stmt.replace(/\s+/g, ' ').trim().toLowerCase()
      .replace(/^(begin|then|else|loop)\s+/, '')
      .replace(/^if .*? then /, '');
    if (stmt) {
      try { handle(stmt, f); } catch (e) { warnings.push(`${f}: ${e.message}`); }
    }
  }
}

const list = [...tables.values()];
const referenced = new Set(list.flatMap((t) => t.fks.map((f) => key(f.target.schema, f.target.name))));
const model = {
  generatedFrom: `${files.length} migrations (última: ${files.at(-1)})`,
  tables: list
    .filter((t) => !t.external || referenced.has(key(t.schema, t.name)))
    .map((t) => ({
      id: key(t.schema, t.name), schema: t.schema, name: t.name, external: t.external, baseline: !!t.baseline, file: t.file,
      pk: t.pk, columns: t.columns,
      fks: t.fks.map((f) => ({ columns: f.columns, target: key(f.target.schema, f.target.name), targetColumns: f.targetColumns, onDelete: f.onDelete })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
};

// ---------- Mermaid ----------
const byId = new Map(model.tables.map((t) => [t.id, t]));
const tableCount = (s) => model.tables.filter((t) => t.schema === s && !t.external).length;
const schemas = [...new Set(model.tables.filter((t) => !t.external).map((t) => t.schema))]
  .sort((a, b) => (a === 'public' ? -1 : b === 'public' ? 1 : a.localeCompare(b)));

const entity = (id, home) => {
  const t = byId.get(id);
  return t.schema === home && !t.external ? t.name : `${t.schema}-${t.name}`;
};
const mermaidType = (type) => (type || 'text')
  .replace('timestamp with time zone', 'timestamptz')
  .replace('character varying', 'varchar')
  .replace('double precision', 'float8')
  .replace(/\(.*\)/, '')
  .replace(/\[\]$/, '_array')
  .split(/\s+/)[0];

// FK nula = zero ou um; not null = exatamente um; FK que também é PK/unique = 1:1.
function relation(t, f) {
  const col = t.columns.find((c) => c.name === f.columns[0]);
  const optional = f.columns.length === 1 && col && !col.notNull;
  const oneToOne = f.columns.length === 1 && (col?.unique || (t.pk.length === 1 && t.pk[0] === f.columns[0]));
  return `${oneToOne ? '|o' : '}o'}--${optional ? 'o|' : '||'}`;
}

function erDiagram(schema) {
  const own = model.tables.filter((t) => t.schema === schema && !t.external);
  const foreign = new Set();
  const lines = ['erDiagram'];
  for (const t of own) {
    const fkCols = new Set(t.fks.flatMap((f) => f.columns));
    lines.push(`  ${t.name} {`);
    for (const c of t.columns.filter((c) => t.pk.includes(c.name) || fkCols.has(c.name))) {
      const tags = [t.pk.includes(c.name) && 'PK', fkCols.has(c.name) && 'FK'].filter(Boolean).join(',');
      lines.push(`    ${mermaidType(c.type)} ${c.name} ${tags}`);
    }
    lines.push('  }');
  }
  for (const t of own) {
    for (const f of t.fks) {
      const target = byId.get(f.target);
      if (target.schema !== schema || target.external) foreign.add(f.target);
      lines.push(`  ${t.name} ${relation(t, f)} ${entity(f.target, schema)} : "${f.columns.join(', ')}"`);
    }
  }
  return { mermaid: lines.join('\n'), own, foreign: [...foreign].sort() };
}

function overview() {
  const edges = new Map();
  for (const t of model.tables) for (const f of t.fks) {
    const to = byId.get(f.target).schema;
    if (to === t.schema) continue;
    const k = `${t.schema}>${to}`;
    edges.set(k, (edges.get(k) || 0) + 1);
  }
  const nodes = new Set([...schemas, ...[...edges.keys()].flatMap((k) => k.split('>'))]);
  const lines = ['flowchart LR'];
  for (const s of [...nodes].sort()) {
    const n = tableCount(s);
    lines.push(`  ${s}["${s}<br/>${n ? `${n} tabelas` : '(externo)'}"]`);
  }
  for (const [k, n] of [...edges].sort()) {
    const [a, b] = k.split('>');
    lines.push(`  ${a} -->|${n} FK${n > 1 ? 's' : ''}| ${b}`);
  }
  return { mermaid: lines.join('\n'), edges: [...edges].map(([k, count]) => ({ from: k.split('>')[0], to: k.split('>')[1], count })) };
}

fs.mkdirSync(outDir, { recursive: true });
const ov = overview();
const totalFks = model.tables.reduce((a, t) => a + t.fks.length, 0);
const fence = '```';
const readme = [
  '# Diagramas do banco (Supabase)',
  '',
  `> Gerado por \`npm run docs:db\` a partir de ${model.generatedFrom}. Não editar à mão.`,
  '',
  `${schemas.reduce((a, s) => a + tableCount(s), 0)} tabelas em ${schemas.length} schemas, ${totalFks} chaves estrangeiras.`,
  '',
  '## Dependências entre schemas',
  '',
  'A seta vai de quem referencia para quem é referenciado; o rótulo é o número de FKs.',
  '',
  `${fence}mermaid`, ov.mermaid, fence,
  '',
  '## Diagrama ER por schema',
  '',
  ...schemas.map((s) => `- [${s}](${s}.md) (${tableCount(s)} tabelas)`),
  '',
  '## Limitações',
  '',
  '- `public.colaboradores`, `public.unidades` e `public.departamentos` nasceram no baseline remoto (migrations placeholder): só aparecem `id`, as FKs confirmadas por renomeação de constraint e as colunas adicionadas depois.',
  '- Os diagramas ER mostram só colunas PK/FK. A lista completa de colunas está em `model.json`.',
  '- Cardinalidade: FK nula = zero ou um (`o|`); FK `not null` = exatamente um (`||`); FK que também é PK/unique = 1:1.',
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'README.md'), readme);

const diagrams = {};
for (const s of schemas) {
  const d = erDiagram(s);
  diagrams[s] = { mermaid: d.mermaid, foreign: d.foreign };
  fs.writeFileSync(path.join(outDir, `${s}.md`), [
    `# Schema \`${s}\``,
    '',
    '> Gerado por `npm run docs:db`. [Voltar ao índice](README.md)',
    '',
    `${d.own.length} tabelas.${d.foreign.length ? ` Tabelas de fora (prefixadas com o schema): ${d.foreign.map((x) => `\`${x}\``).join(', ')}.` : ''}`,
    '',
    `${fence}mermaid`, d.mermaid, fence,
    '',
  ].join('\n'));
}
fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify({ ...model, schemas, overview: ov, diagrams }, null, 1));
console.log(`docs/db: ${schemas.length} schemas, ${model.tables.length} tabelas (incl. externas), ${totalFks} FKs`);
if (warnings.length) console.warn(warnings.join('\n'));
