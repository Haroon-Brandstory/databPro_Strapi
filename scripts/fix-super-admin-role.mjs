/**
 * Links all active admin users to Super Admin (role id 1) if they have no roles.
 * Fixes: "no super admin", Media Library / file access, Content Manager restrictions.
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
    process.env[t.slice(0, i).trim()] ??= t.slice(i + 1).trim();
  }
}

const c = new pg.Client({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT),
  database: process.env.DATABASE_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});
await c.connect();

const { rows: superAdmin } = await c.query(
  `SELECT id FROM admin_roles WHERE code = 'strapi-super-admin' LIMIT 1`,
);
if (!superAdmin.length) {
  console.error('Super Admin role not found.');
  process.exit(1);
}
const roleId = superAdmin[0].id;

const { rows: users } = await c.query(
  `SELECT u.id, u.email FROM admin_users u
   WHERE u.is_active = true AND NOT EXISTS (
     SELECT 1 FROM admin_users_roles_lnk l WHERE l.user_id = u.id
   )`,
);

if (!users.length) {
  console.log('All active admin users already have at least one role.');
  await c.end();
  process.exit(0);
}

for (const u of users) {
  const { rows: mx } = await c.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM admin_users_roles_lnk`);
  const nextId = mx[0].next_id;
  await c.query(
    `INSERT INTO admin_users_roles_lnk (id, user_id, role_id, role_ord, user_ord)
     VALUES ($1, $2, $3, 1, 1)`,
    [nextId, u.id, roleId],
  );
  console.log(`Linked admin user id=${u.id} (${u.email}) → Super Admin (role_id=${roleId}).`);
}

await c.end();
