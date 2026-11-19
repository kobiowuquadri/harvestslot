// Starts an isolated HarvestSlot stack for browser tests:
//   1. drops and recreates the E2E database (local hosts only), 2. applies migrations exactly as in
//   deployment, 3. loads the demo seed, 4. runs the built API, worker and web app.
// Playwright launches this as its webServer; it expects `pnpm build` to have run first.
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import pg from 'pg';
import { BASE_URL, e2eDatabaseUrl, repoRoot, stackEnv } from './support/env.mjs';

const url = new URL(e2eDatabaseUrl());
const dbName = url.pathname.slice(1);
const localHosts = ['localhost', '127.0.0.1', '::1', 'postgres'];
if (!localHosts.includes(url.hostname) && process.env.E2E_ALLOW_REMOTE_DB !== '1') {
  console.error(`Refusing to recreate ${dbName} on ${url.hostname}: browser tests only reset local databases.`);
  process.exit(1);
}
if (!/_e2e$|^hs_e2e/.test(dbName)) {
  console.error(`Refusing to recreate "${dbName}": the E2E database name must end in _e2e.`);
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8' TEMPLATE template0`);
await admin.end();

const env = stackEnv();
const node = process.execPath;
const dbPackage = join(repoRoot, 'packages', 'db');
const prismaCli = createRequire(join(dbPackage, 'package.json')).resolve('prisma/build/index.js');
execFileSync(node, [prismaCli, 'migrate', 'deploy'], { cwd: dbPackage, env, stdio: 'inherit' });
execFileSync(node, [join(repoRoot, 'apps/worker/dist/migrate-queue.js')], { cwd: repoRoot, env, stdio: 'inherit' });
execFileSync(node, [join(repoRoot, 'apps/api/dist/cli/seed.js')], { cwd: repoRoot, env, stdio: 'inherit' });

const children = [
  spawn(node, ['--enable-source-maps', 'dist/main.js'], { cwd: join(repoRoot, 'apps/api'), env, stdio: 'inherit' }),
  spawn(node, ['--enable-source-maps', 'dist/main.js'], { cwd: join(repoRoot, 'apps/worker'), env, stdio: 'inherit' }),
  spawn(node, [createRequire(join(repoRoot, 'apps/web/package.json')).resolve('next/dist/bin/next'), 'start', '--port', new URL(BASE_URL).port || '3000'], { cwd: join(repoRoot, 'apps/web'), env, stdio: 'inherit' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 3000).unref();
}
for (const c of children) c.on('exit', (code) => !stopping && (console.error(`stack process exited (${code})`), stop(1)));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
