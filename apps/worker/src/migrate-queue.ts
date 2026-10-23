// Deployment step: apply BullMQ's PostgreSQL-backend schema migrations (no-op when using Redis).
import pg from 'pg';
import { runMigrations } from 'bullmq';
import { effectiveQueueBackend, loadConfig } from '@harvestslot/config';

const env = loadConfig();
if (effectiveQueueBackend(env) !== 'postgres') {
  console.warn('QUEUE_BACKEND is redis; no queue migrations needed.');
  process.exit(0);
}
const client = new pg.Client({ connectionString: env.DATABASE_URL });
await client.connect();
try {
  const version = await runMigrations(client, 'bullmq');
  console.warn(`BullMQ PostgreSQL schema at version ${version}`);
} finally {
  await client.end();
}
