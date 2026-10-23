import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (not esbuild/oxc) so Nest's emitted decorator metadata works in tests.
const plugins = [
  swc.vite({
    jsc: {
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
      target: 'es2023',
    },
    module: { type: 'es6' },
  }),
];

export default defineConfig({
  test: {
    projects: [
      { plugins, test: { name: 'unit', include: ['test/unit/**/*.test.ts'], environment: 'node' } },
      {
        plugins,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/support/global-setup.mjs'],
          setupFiles: ['test/support/env-setup.ts'],
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
          pool: 'forks',
        },
      },
    ],
  },
});
