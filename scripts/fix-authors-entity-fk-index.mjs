/**
 * Drops Strapi "entity_fk" indexes that already exist under another table
 * (e.g. *_cmps vs *_components), which makes CREATE INDEX fail on startup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvFiles() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadEnvFiles();

const schema = process.env.DATABASE_SCHEMA || 'public';

function qIdent(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function main() {
  const client = process.env.DATABASE_URL
    ? new pg.Client({ connectionString: process.env.DATABASE_URL })
    : new pg.Client({
        host: process.env.DATABASE_HOST || 'localhost',
        port: Number(process.env.DATABASE_PORT || 5432),
        database: process.env.DATABASE_NAME || 'strapi',
        user: process.env.DATABASE_USERNAME || 'strapi',
        password: process.env.DATABASE_PASSWORD || '',
      });

  const clientName = process.env.DATABASE_CLIENT || 'postgres';
  if (clientName !== 'postgres' && !process.env.DATABASE_URL?.includes('postgres')) {
    console.error('Use PostgreSQL (DATABASE_CLIENT=postgres or postgres DATABASE_URL).');
    process.exit(1);
  }

  await client.connect();

  const { rows } = await client.query(
    `SELECT indexname, tablename
     FROM pg_indexes
     WHERE schemaname = $1
       AND indexname ~ 'entity_fk$'`,
    [schema],
  );

  if (rows.length === 0) {
    console.log(`No indexes matching entity_fk$ in schema "${schema}".`);
    await client.end();
    return;
  }

  for (const { indexname, tablename } of rows) {
    const sql = `DROP INDEX IF EXISTS ${qIdent(schema)}.${qIdent(indexname)}`;
    await client.query(sql);
    console.log(`OK: ${sql}  (was on ${tablename})`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
