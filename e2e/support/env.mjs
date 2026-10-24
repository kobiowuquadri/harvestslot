// Shared settings for the browser test stack (plain JS so both the launcher and the tests can use it).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function rootEnv() {
  const file = join(repoRoot, '.env');
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return out;
}

const env = { ...rootEnv(), ...process.env };

/** Web origin under test. */
export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * The E2E database. Defaults to `<dev database>_e2e` on the same server, so browser tests never
 * touch development data. It is dropped and recreated on every run (local hosts only).
 */
export function e2eDatabaseUrl() {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env or E2E_DATABASE_URL');
  const url = new URL(env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_e2e`;
  return url.toString();
}

/** Environment for the API, worker and seed during browser tests. */
export function stackEnv() {
  return {
    ...process.env,
    DATABASE_URL: e2eDatabaseUrl(),
    APP_ENV: 'test',
    NODE_ENV: 'development',
    DEMO_MODE: 'true',
    DEV_TOOLS_ENABLED: 'true',
    QUEUE_BACKEND: process.env.E2E_QUEUE_BACKEND ?? 'postgres',
    REDIS_URL: process.env.E2E_REDIS_URL ?? '',
    MAIL_TRANSPORT: 'dev-capture',
    PAYMENT_PROVIDER: 'simulated',
    STORAGE_DRIVER: process.env.E2E_STORAGE_DRIVER ?? 'filesystem',
    PUBLIC_BASE_URL: BASE_URL,
    ALLOWED_ORIGINS: BASE_URL,
    COOKIE_SECURE: 'false',
    ADMIN_REQUIRE_MFA: 'false',
  };
}
