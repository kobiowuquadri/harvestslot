import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config as loadDotenvFile } from 'dotenv';
import { envSchema, type Env } from './env.js';

export * from './env.js';

/** Walks up from `start` until it finds the workspace root (the directory holding pnpm-workspace.yaml). */
export function findRepoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}

let dotenvLoaded = false;

/** Loads `<repo>/.env` once without overriding variables already present in the process environment. */
export function loadDotenv(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  const file = join(findRepoRoot(), '.env');
  if (existsSync(file)) loadDotenvFile({ path: file, override: false, quiet: true });
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  return Object.freeze(result.data);
}

let cached: Env | undefined;

/** Validated, frozen configuration. Throws `ConfigError` listing every problem at startup. */
export function loadConfig(): Env {
  if (!cached) {
    loadDotenv();
    cached = parseEnv(process.env);
  }
  return cached;
}

/** Test helper: forget the cached configuration so a test can re-parse a modified environment. */
export function resetConfigCache(): void {
  cached = undefined;
}

/** Resolves a configured path relative to the repository root. */
export function resolveFromRoot(path: string): string {
  return resolve(findRepoRoot(), path);
}
