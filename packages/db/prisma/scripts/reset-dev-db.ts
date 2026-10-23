/**
 * Drops and recreates the local development database schema, then re-applies migrations.
 *
 *   pnpm db:reset --confirm
 *
 * Safeguards: refuses unless NODE_ENV is not production, APP_ENV is local or test, the database
 * host is local (localhost / 127.0.0.1 / the docker-compose service name), and --confirm is given.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import pg from 'pg';

const root = resolve(import.meta.dirname, '../../../..');
if (existsSync(resolve(root, '.env'))) config({ path: resolve(root, '.env'), quiet: true });

const url = process.env.DATABASE_URL;
const appEnv = process.env.APP_ENV ?? 'local';
const nodeEnv = process.env.NODE_ENV ?? 'development';
const fail = (msg: string) => {
  console.error(`Refusing to reset: ${msg}`);
  process.exit(1);
};
if (!url) fail('DATABASE_URL is not set');
if (nodeEnv === 'production' || !['local', 'test'].includes(appEnv)) fail(`NODE_ENV=${nodeEnv} APP_ENV=${appEnv} (allowed only for APP_ENV=local|test)`);
const host = new URL(url!).hostname;
if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) fail(`database host "${host}" is not a local development database`);
if (!process.argv.includes('--confirm')) fail('pass --confirm to acknowledge that ALL data in this database will be deleted');

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query('DROP SCHEMA IF EXISTS public CASCADE');
await client.query('DROP SCHEMA IF EXISTS bullmq CASCADE');
await client.query('CREATE SCHEMA public');
await client.end();
console.warn('Schema dropped. Applying migrations…');
const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: resolve(import.meta.dirname, '../..'), stdio: 'inherit' });
console.warn('Database reset complete. Run `pnpm db:seed` to load demonstration data.');
