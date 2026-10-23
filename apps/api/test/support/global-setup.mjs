// Integration tests run against a real PostgreSQL. If TEST_DATABASE_URL is set (CI service
// container) it is used; otherwise a disposable embedded PostgreSQL server is started.
// Migrations are applied with `prisma migrate deploy`, exactly as in deployment.
// Plain JavaScript on purpose: global setup runs outside the SWC-transformed test runtime.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

export default async function setup(project) {
  const repoRoot = resolve(import.meta.dirname, '../../../..');
  let server = null;
  let dataDir = null;
  let baseUrl = process.env.TEST_DATABASE_URL;
  if (!baseUrl) {
    dataDir = mkdtempSync(join(tmpdir(), 'hs-it-pg-'));
    const port = 56000 + Math.floor(Math.random() * 2000);
    server = new EmbeddedPostgres({ databaseDir: dataDir, user: 'hs_test', password: 'hs_test', port, persistent: false, initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
    await server.initialise();
    await server.start();
    baseUrl = `postgresql://hs_test:hs_test@localhost:${port}/postgres`;
  }
  const dbName = `hs_it_${Date.now()}`;
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();
  const url = new URL(baseUrl);
  url.pathname = `/${dbName}`;
  const databaseUrl = url.toString();

  const dbPackage = join(repoRoot, 'packages', 'db');
  const prismaCli = createRequire(join(dbPackage, 'package.json')).resolve('prisma/build/index.js');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: dbPackage, env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  } catch (error) {
    console.error('prisma migrate deploy failed', error.stdout?.toString(), error.stderr?.toString());
    throw error;
  }
  project.provide('databaseUrl', databaseUrl);

  return async () => {
    if (server) await server.stop();
    if (dataDir) {
      try {
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch {
        // Windows may keep the data directory locked briefly after shutdown; it is in the OS temp dir.
      }
    }
  };
}
