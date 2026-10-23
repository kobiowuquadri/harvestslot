import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inject } from 'vitest';

// Configuration must be in place before the Nest app module (which validates env) is imported.
Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: inject('databaseUrl'),
  DATABASE_POOL_MAX: '20',
  QUEUE_BACKEND: 'postgres',
  REDIS_URL: '',
  SESSION_SECRET: 'integration-test-session-secret-0123456789abcdef',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  COOKIE_SECURE: 'false',
  ADMIN_REQUIRE_MFA: 'false',
  PUBLIC_BASE_URL: 'http://localhost:3000',
  ALLOWED_ORIGINS: 'http://localhost:3000',
  STORAGE_DRIVER: 'filesystem',
  FILESYSTEM_STORAGE_DIR: mkdtempSync(join(tmpdir(), 'hs-it-files-')),
  MAIL_TRANSPORT: 'dev-capture',
  MAIL_LOCAL_CAPTURE: 'false',
  SMS_PROVIDER: 'none',
  PAYMENT_PROVIDER: 'simulated',
  PAYMENT_SIMULATOR_SECRET: 'integration-simulator-secret',
  DEMO_MODE: 'false',
  DEV_TOOLS_ENABLED: 'true',
  PLATFORM_FEE_ENABLED: 'true',
  PLATFORM_FEE_BPS: '150',
});
