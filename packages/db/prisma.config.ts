import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 does not load .env automatically; the workspace keeps one .env at the repository root.
const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) loadDotenv({ path: rootEnv, override: false, quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed/index.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
