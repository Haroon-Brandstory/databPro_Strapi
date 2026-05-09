/**
 * De-duplicates `slug` per table (Strapi UID) so UNIQUE constraints can be created.
 * Keeps lowest `id`; sets slug = slug || '-' || id for duplicate rows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env', '.env.local']) {
  const p = path.join(root, name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const schema = process.env.DATABASE_SCHEMA || 'public';

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

function qIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

await client.connect();

const { rows: tables } = await client.query(
  `SELECT DISTINCT table_name
   FROM information_schema.columns
   WHERE table_schema = $1
     AND column_name = 'slug'
     AND table_name NOT LIKE 'strapi\\_%' ESCAPE '\\'
   ORDER BY table_name`,
  [schema],
);

let total = 0;
for (const { table_name } of tables) {
  const t = qIdent(table_name);
  const { rows: dupes } = await client.query(
    `SELECT slug, COUNT(*)::int AS c FROM ${qIdent(schema)}.${t}
     WHERE slug IS NOT NULL AND slug <> ''
     GROUP BY slug HAVING COUNT(*) > 1`,
  );
  if (dupes.length === 0) continue;

  console.log(`Table ${table_name}: ${dupes.length} duplicate slug group(s)`);
  const { rowCount } = await client.query(
    `WITH ranked AS (
       SELECT id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
       FROM ${qIdent(schema)}.${t}
       WHERE slug IS NOT NULL AND slug <> ''
     )
     UPDATE ${qIdent(schema)}.${t} p
     SET slug = p.slug || '-' || p.id::text
     FROM ranked r
     WHERE p.id = r.id AND r.rn > 1`,
  );
  total += rowCount;
}

console.log(total ? `OK: updated ${total} duplicate slug row(s) across tables.` : 'No duplicate slugs found.');
await client.end();
