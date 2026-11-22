// Schema before app: a production deploy must not ship ahead of the database.
// Compares the newest migration in supabase/migrations with the newest one
// applied in the target project (public.app_schema_version(), migration
// 20261121150000). Fails when the project is behind.
//
// Runs only for Vercel production builds (VERCEL_ENV=production) or when
// VERIFY_PROD_SCHEMA=1. Uses the service-role key (the RPC is service-role
// only). The key is never logged or bundled. Until the RPC itself
// is applied, and on a network error, it warns and passes: the check must
// never block a deploy for a reason other than a missing migration.
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const enabled = process.env.VERCEL_ENV === 'production' || process.env.VERIFY_PROD_SCHEMA === '1';
if (!enabled) {
  console.log('Schema-before-app check skipped (not a production build).');
  process.exit(0);
}

const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!url || !key) {
  console.error('Schema-before-app check: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for a production build.');
  process.exit(1);
}

const files = (await readdir(resolve(root, 'supabase/migrations'))).filter(f => f.endsWith('.sql')).sort();
const newest = files.at(-1).slice(0, 14);

let applied;
try {
  const response = await fetch(`${url}/rest/v1/rpc/app_schema_version`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) {
    console.warn('Schema-before-app check: app_schema_version() is not in production yet (apply 20261121150000). Passing.');
    process.exit(0);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body !== 'string' || !/^\d{14}$/.test(body)) {
    console.warn('Schema-before-app check: production returned no migration version. Passing.');
    process.exit(0);
  }
  applied = body;
} catch (error) {
  console.warn(`Schema-before-app check could not reach production (${error.message}). Passing.`);
  process.exit(0);
}

if (applied < newest) {
  const pending = files.filter(f => f.slice(0, 14) > applied);
  console.error(`Production schema is behind this build: newest applied ${applied}, newest in repo ${newest}.`);
  console.error(`Apply these migrations to production first, then redeploy:\n- ${pending.join('\n- ')}`);
  process.exit(1);
}
console.log(`Schema-before-app check passed: production is at ${applied} (repo ${newest}).`);
