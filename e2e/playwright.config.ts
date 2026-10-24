import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './support/env.mjs';

/**
 * Browser tests run against a real stack (API + worker + web + PostgreSQL) on a dedicated, freshly
 * migrated and seeded database. Set E2E_EXTERNAL_STACK=1 to test an already running stack instead.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'en-NG',
    timezoneId: 'Africa/Lagos',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_EXTERNAL_STACK
    ? undefined
    : {
        command: 'node stack.mjs',
        url: `${BASE_URL}/api/v1/health/ready`,
        timeout: 240_000,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
