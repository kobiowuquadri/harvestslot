import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { Queue, Worker, createPostgresBackend, runMigrations, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import pg from 'pg';
import { pino } from 'pino';
import { ConfigError, effectiveQueueBackend, loadConfig, type Env } from '@harvestslot/config';
import {
  cleanupIdempotencyRecords,
  createMessaging,
  createPaymentProvider,
  createStorage,
  deliverNotification,
  drainOutbox,
  escalateOverdueDisputes,
  escalateOverdueReceivingReviews,
  fulfilDataExport,
  OUTBOX_TYPES,
  processWebhookEvent,
  recheckReadiness,
  reconcilePendingPayments,
  sendInvoiceReminders,
  sweepExpiredHolds,
  type OutboxHandler,
} from '@harvestslot/core';
import { createPrismaClient } from '@harvestslot/db';

const QUEUE_NAME = 'harvestslot-maintenance';
export const BULLMQ_SCHEMA = 'bullmq';

/** Repeating maintenance jobs. Each is an optimisation; request paths stay correct without them. */
export const SCHEDULES: Array<{ id: string; everyMs: number; description: string }> = [
  { id: 'drain-outbox', everyMs: 5_000, description: 'Deliver queued notifications and process webhooks' },
  { id: 'sweep-holds', everyMs: 30_000, description: 'Expire lapsed offers, booking holds and trip holds' },
  { id: 'escalations', everyMs: 300_000, description: 'Escalate overdue receiving reviews and disputes' },
  { id: 'readiness-recheck', everyMs: 300_000, description: 'Persist time-based readiness changes' },
  { id: 'invoice-reminders', everyMs: 3_600_000, description: 'Remind payers about due and overdue invoices' },
  { id: 'payment-reconcile', everyMs: 600_000, description: 'Re-verify pending provider payments (missed webhooks)' },
  { id: 'cleanup', everyMs: 86_400_000, description: 'Remove expired idempotency records' },
];

async function main(): Promise<void> {
  let env: Env;
  try {
    env = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const log = pino({ level: env.LOG_LEVEL, name: 'worker', redact: ['*.password', '*.token', '*.code'] });
  const workerId = `${hostname()}:${process.pid}`;
  const prisma = createPrismaClient({ url: env.DATABASE_URL, poolMax: Math.max(4, Math.floor(env.DATABASE_POOL_MAX / 2)), applicationName: 'harvestslot-worker' });
  const messaging = createMessaging(env);
  const storage = createStorage(env);
  const payments = createPaymentProvider(env, prisma);
  const backend = effectiveQueueBackend(env);

  const handlers: Record<string, OutboxHandler> = {
    [OUTBOX_TYPES.NOTIFICATION_DELIVER]: (event) => {
      const p = event.payload as { notificationId: string; category: string };
      return deliverNotification(prisma, messaging, env, p.notificationId, p.category);
    },
    'payment.webhook': async (event) => {
      if (!payments) return 'done';
      await processWebhookEvent(prisma, payments, (event.payload as { eventId: string }).eventId);
      return 'done';
    },
    [OUTBOX_TYPES.DATA_EXPORT]: async (event) => {
      await fulfilDataExport(prisma, storage, (event.payload as { requestId: string }).requestId);
      return 'done';
    },
  };

  const lastRun = new Map<string, { at: string; ok: boolean; detail: unknown }>();
  const run = async (name: string): Promise<unknown> => {
    switch (name) {
      case 'drain-outbox':
        return drainOutbox(prisma, handlers, workerId, { batchSize: 50 });
      case 'sweep-holds':
        return sweepExpiredHolds(prisma);
      case 'escalations':
        return { receiving: await escalateOverdueReceivingReviews(prisma), disputes: await escalateOverdueDisputes(prisma) };
      case 'readiness-recheck':
        return { changed: await recheckReadiness(prisma) };
      case 'invoice-reminders':
        return { reminded: await sendInvoiceReminders(prisma) };
      case 'payment-reconcile':
        return { applied: await reconcilePendingPayments(prisma, payments) };
      case 'cleanup':
        return { removed: await cleanupIdempotencyRecords(prisma) };
      default:
        throw new Error(`Unknown job ${name}`);
    }
  };

  // ── BullMQ on Redis or on its PostgreSQL backend ──
  // The two backends have different connection generics; the worker only needs this surface.
  interface QueueLike {
    upsertJobScheduler(id: string, repeat: { every: number }, template: { name: string; data: object; opts: object }): Promise<unknown>;
    close(): Promise<void>;
  }
  interface WorkerLike {
    close(): Promise<void>;
    isRunning(): boolean;
    on(event: 'failed', listener: (job: Job | undefined, err: Error) => void): unknown;
  }
  let queue: QueueLike;
  let worker: WorkerLike;
  let redis: Redis | null = null;
  const processor = async (job: Job) => {
    try {
      const detail = await run(job.name);
      lastRun.set(job.name, { at: new Date().toISOString(), ok: true, detail });
      const d = detail as { claimed?: number; offersExpired?: number; bookingsExpired?: number } | undefined;
      if ((d?.claimed ?? 0) > 0 || (d?.offersExpired ?? 0) > 0 || (d?.bookingsExpired ?? 0) > 0) log.info({ job: job.name, detail }, 'job completed');
      return detail;
    } catch (error) {
      lastRun.set(job.name, { at: new Date().toISOString(), ok: false, detail: String(error) });
      log.error({ job: job.name, err: error }, 'job failed');
      throw error;
    }
  };
  if (backend === 'redis') {
    redis = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
    queue = new Queue(QUEUE_NAME, { connection: redis }) as unknown as QueueLike;
    worker = new Worker(QUEUE_NAME, processor, { connection: redis, concurrency: 1 }) as unknown as WorkerLike;
  } else {
    // Schema migrations for the queue tables are idempotent and serialised by an advisory lock.
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
    const client = await pool.connect();
    try {
      await runMigrations(client, BULLMQ_SCHEMA);
    } finally {
      client.release();
      await pool.end();
    }
    const opts = { connection: { connectionString: env.DATABASE_URL, schema: BULLMQ_SCHEMA, max: 4 } };
    queue = new Queue(QUEUE_NAME, opts, createPostgresBackend) as unknown as QueueLike;
    worker = new Worker(QUEUE_NAME, processor, { ...opts, concurrency: 1 }, createPostgresBackend) as unknown as WorkerLike;
  }
  worker.on('failed', (job, err) => log.warn({ job: job?.name, err: err.message }, 'job attempt failed'));
  for (const s of SCHEDULES) {
    await queue.upsertJobScheduler(s.id, { every: s.everyMs }, { name: s.id, data: {}, opts: { removeOnComplete: 100, removeOnFail: 500, attempts: 1 } });
  }
  log.info({ backend, schedules: SCHEDULES.map((s) => s.id), workerId }, 'HarvestSlot worker started');

  // ── Health endpoint for container orchestration ──
  const healthPort = Number(process.env.WORKER_HEALTH_PORT ?? 4100);
  const startedAt = new Date().toISOString();
  const server = createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    let db = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'unavailable';
    }
    const status = db === 'ok' && worker.isRunning() ? 200 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ status: status === 200 ? 'ok' : 'degraded', backend, database: db, startedAt, lastRun: Object.fromEntries(lastRun) }));
  });
  server.listen(healthPort, '0.0.0.0');

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down: finishing the current job');
    server.close();
    await worker.close();
    await queue.close();
    await redis?.quit().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
