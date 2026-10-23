#!/usr/bin/env node
// Local infrastructure for hosts without Docker: runs a real PostgreSQL server from the
// `embedded-postgres` binaries. Redis/MinIO/Mailpit are not provided here; configure
// QUEUE_BACKEND=postgres, STORAGE_DRIVER=filesystem and MAIL_TRANSPORT=dev-capture (see README).
//
// Usage: pnpm infra:local            (foreground; Ctrl+C stops the server)
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../..');
const dataDir = join(root, '.local', 'postgres');
const port = Number(process.env.LOCAL_PG_PORT ?? 5432);
const user = 'harvestslot';
const password = 'harvestslot';
const databases = ['harvestslot'];

mkdirSync(join(root, '.local'), { recursive: true });
const firstRun = !existsSync(join(dataDir, 'PG_VERSION'));

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  user,
  password,
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: (e) => console.error(String(e).trim()),
});

if (firstRun) {
  console.log(`Initialising PostgreSQL data directory at ${dataDir}`);
  await server.initialise();
}
await server.start();

const admin = new pg.Client({ host: 'localhost', port, user, password, database: 'postgres' });
await admin.connect();
for (const db of databases) {
  const exists = await admin.query('select 1 from pg_database where datname = $1', [db]);
  if (exists.rowCount === 0) {
    await admin.query(`create database "${db}"`);
    console.log(`Created database ${db}`);
  }
}
const { rows } = await admin.query('show server_version');
await admin.end();

console.log(`PostgreSQL ${rows[0].server_version} ready on postgresql://${user}:${password}@localhost:${port}/harvestslot`);
console.log('Press Ctrl+C to stop.');

let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL…');
  await server.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
