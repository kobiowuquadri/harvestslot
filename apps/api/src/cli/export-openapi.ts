/**
 * Writes the OpenAPI document to docs/openapi.json without starting an HTTP listener.
 *
 *   pnpm --filter @harvestslot/api openapi:export
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolveFromRoot } from '@harvestslot/config';
import { buildOpenApi, createApp } from '../bootstrap.js';

async function main() {
  const app = await createApp({ logger: false });
  try {
    await app.init();
    const doc = buildOpenApi(app);
    const out = resolveFromRoot('docs/openapi.json');
    writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
  } finally {
    await app.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
