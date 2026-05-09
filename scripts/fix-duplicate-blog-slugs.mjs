/**
 * Makes blog_slug values unique so Strapi can add blog_posts_blog_slug_unique.
 * Keeps one row per slug (lowest id); appends "-{id}" to other duplicates.
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
    let v = t.slice(i + 1).trim();
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

const client = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

await client.connect();

const { rows: dupes } = await client.query(`
  SELECT blog_slug, COUNT(*)::int AS c
  FROM blog_posts
  WHERE blog_slug IS NOT NULL AND blog_slug <> ''
  GROUP BY blog_slug
  HAVING COUNT(*) > 1
`);

if (dupes.length === 0) {
  console.log('No duplicate blog_slug values.');
  await client.end();
  process.exit(0);
}

console.log('Found duplicate slugs:', dupes);

const { rowCount } = await client.query(`
  WITH ranked AS (
    SELECT id, blog_slug,
      ROW_NUMBER() OVER (PARTITION BY blog_slug ORDER BY id) AS rn
    FROM blog_posts
    WHERE blog_slug IS NOT NULL AND blog_slug <> ''
  )
  UPDATE blog_posts p
  SET blog_slug = p.blog_slug || '-' || p.id::text
  FROM ranked r
  WHERE p.id = r.id AND r.rn > 1
`);

console.log(`OK: updated ${rowCount} row(s) to de-duplicate blog_slug.`);
await client.end();
