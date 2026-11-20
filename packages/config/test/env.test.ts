import { describe, expect, it } from 'vitest';
import { ConfigError, parseEnv } from '../src/index.js';
import { demoFeaturesAllowed, devToolsAllowed } from '../src/env.js';

const productionBase = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  PUBLIC_BASE_URL: 'https://harvestslot.example.org',
  ALLOWED_ORIGINS: 'https://harvestslot.example.org',
  DATABASE_URL: 'postgresql://hs:secret@db:5432/hs',
  QUEUE_BACKEND: 'redis',
  REDIS_URL: 'redis://redis:6379',
  SESSION_SECRET: 'a7f3c9e1d2b4a6f8c0e2d4b6a8f0c2e4d6b8a0f2c4e6d8b0a2f4c6e8d0b2a4f6',
  DATA_ENCRYPTION_KEY: 'q8Zt3vY1nR6pW2mK9xL4cJ7bH0dF5gS3aE8uI1oP6yT=',
  COOKIE_SECURE: 'true',
  ADMIN_REQUIRE_MFA: 'true',
  STORAGE_DRIVER: 's3',
  S3_ACCESS_KEY_ID: 'AKIA-EXAMPLE',
  S3_SECRET_ACCESS_KEY: 'example-secret',
  MAIL_TRANSPORT: 'smtp',
  MAIL_LOCAL_CAPTURE: 'false',
  PAYMENT_PROVIDER: 'paystack',
  PAYSTACK_MODE: 'live',
  PAYSTACK_SECRET_KEY: 'sk_live_example',
  DEMO_MODE: 'false',
  DEV_TOOLS_ENABLED: 'false',
};

function problems(overrides: Record<string, string>): string[] {
  try {
    parseEnv({ ...productionBase, ...overrides });
    return [];
  } catch (e) {
    if (e instanceof ConfigError) return e.problems;
    throw e;
  }
}

describe('production configuration safety', () => {
  it('accepts a complete production configuration', () => {
    expect(problems({})).toEqual([]);
  });

  it.each([
    [{ DEMO_MODE: 'true' }, 'DEMO_MODE'],
    [{ DEV_TOOLS_ENABLED: 'true' }, 'DEV_TOOLS_ENABLED'],
    [{ PAYMENT_PROVIDER: 'simulated', PAYMENT_SIMULATOR_SECRET: 'x' }, 'PAYMENT_PROVIDER'],
    [{ COOKIE_SECURE: 'false' }, 'COOKIE_SECURE'],
    [{ ADMIN_REQUIRE_MFA: 'false' }, 'ADMIN_REQUIRE_MFA'],
    [{ PUBLIC_BASE_URL: 'http://harvestslot.example.org' }, 'PUBLIC_BASE_URL'],
    [{ STORAGE_DRIVER: 'filesystem' }, 'STORAGE_DRIVER'],
    [{ MAIL_TRANSPORT: 'dev-capture' }, 'MAIL_TRANSPORT'],
    [{ ALLOWED_ORIGINS: 'http://localhost:3000' }, 'ALLOWED_ORIGINS'],
    [{ PAYSTACK_SECRET_KEY: 'sk_test_example' }, 'PAYSTACK_SECRET_KEY'],
    [{ APP_ENV: 'local' }, 'APP_ENV'],
  ])('refuses %o', (overrides, key) => {
    expect(problems(overrides).some((p) => p.startsWith(key))).toBe(true);
  });

  it('demo features and dev tools are never allowed in production, even if flagged on', () => {
    const prod = { NODE_ENV: 'production' as const, APP_ENV: 'production' as const, DEMO_MODE: true, DEV_TOOLS_ENABLED: true };
    expect(demoFeaturesAllowed(prod)).toBe(false);
    expect(devToolsAllowed(prod)).toBe(false);
    expect(demoFeaturesAllowed({ NODE_ENV: 'development', APP_ENV: 'local', DEMO_MODE: true })).toBe(true);
    expect(devToolsAllowed({ NODE_ENV: 'development', APP_ENV: 'demo', DEV_TOOLS_ENABLED: true })).toBe(false);
  });
});

describe('Cloudinary storage and hosted ports', () => {
  const cloudinary = { STORAGE_DRIVER: 'cloudinary', S3_ACCESS_KEY_ID: '', S3_SECRET_ACCESS_KEY: '' };
  it('accepts Cloudinary in production with CLOUDINARY_URL', () => {
    expect(problems({ ...cloudinary, CLOUDINARY_URL: 'cloudinary://123:abc@demo-cloud' })).toEqual([]);
  });
  it('refuses Cloudinary without credentials', () => {
    expect(problems(cloudinary).join(' ')).toContain('CLOUDINARY_URL');
  });
  it('listens on PORT when API_PORT is not set (Render and similar hosts)', () => {
    const env = parseEnv({ ...productionBase, PORT: '10000' });
    expect(env.API_PORT).toBe(10000);
    expect(parseEnv({ ...productionBase, PORT: '10000', API_PORT: '4000' }).API_PORT).toBe(4000);
  });
});

describe('generated secrets', () => {
  it('accepts a 32-byte encryption key in standard or URL-safe base64', () => {
    const key = Buffer.alloc(32, 251);
    expect(problems({ DATA_ENCRYPTION_KEY: key.toString('base64') })).toEqual([]);
    expect(problems({ DATA_ENCRYPTION_KEY: key.toString('base64url') })).toEqual([]);
    expect(problems({ DATA_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64') }).join(' ')).toContain('DATA_ENCRYPTION_KEY');
  });
});
