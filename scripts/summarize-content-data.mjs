/** Prints row counts for Strapi collection tables (best-effort). */
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

const tables = [
  'authors',
  'blog_posts',
  'companies_data',
  'entities',
  'industries',
  'rankings',
  'sectors',
  'service_categories',
  'service_under_categories',
];

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});
await client.connect();

const out = [];
for (const table of tables) {
  try {
    const { rows } = await client.query(`SELECT COUNT(*)::bigint AS c FROM "${table}"`);
    out.push({ table, rows: rows[0].c });
  } catch {
    out.push({ table, rows: 'n/a' });
  }
}
console.log(JSON.stringify(out, null, 2));
await client.end();
