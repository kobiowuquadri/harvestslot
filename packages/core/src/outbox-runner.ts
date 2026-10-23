import type { OutboxEvent, PrismaClient } from '@harvestslot/db';
import { backoffDelayMs } from './outbox.js';

export type OutboxHandler = (event: OutboxEvent) => Promise<'done' | 'retry'>;

const STALE_LOCK_MS = 5 * 60_000;

/** Claims a batch of due events. SKIP LOCKED lets several workers drain concurrently without overlap. */
export async function claimOutboxBatch(prisma: PrismaClient, workerId: string, limit: number, now: Date): Promise<OutboxEvent[]> {
  return prisma.$transaction(async (tx) => {
    const stale = new Date(now.getTime() - STALE_LOCK_MS);
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM outbox_events
       WHERE (status IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
          OR (status = 'PROCESSING' AND "lockedAt" < ${stale})
       ORDER BY "nextAttemptAt"
       LIMIT ${limit}
       FOR UPDATE SKIP LOCKED`;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    await tx.outboxEvent.updateMany({ where: { id: { in: ids } }, data: { status: 'PROCESSING', lockedAt: now, lockedBy: workerId } });
    return tx.outboxEvent.findMany({ where: { id: { in: ids } } });
  });
}

export interface DrainResult {
  claimed: number;
  done: number;
  retried: number;
  dead: number;
}

/**
 * Processes due outbox events. Business state is already committed; a provider failure only delays
 * delivery. Events are retried with exponential backoff and dead-lettered after `maxAttempts`
 * (visible and re-queueable in the admin console).
 */
export async function drainOutbox(
  prisma: PrismaClient,
  handlers: Record<string, OutboxHandler>,
  workerId: string,
  options: { batchSize?: number; now?: () => Date } = {},
): Promise<DrainResult> {
  const now = options.now ?? (() => new Date());
  const result: DrainResult = { claimed: 0, done: 0, retried: 0, dead: 0 };
  const batch = await claimOutboxBatch(prisma, workerId, options.batchSize ?? 25, now());
  result.claimed = batch.length;
  for (const event of batch) {
    const handler = handlers[event.type];
    let outcome: 'done' | 'retry' = 'retry';
    let error: string | null = null;
    if (!handler) {
      error = `No handler for event type ${event.type}`;
    } else {
      try {
        outcome = await handler(event);
      } catch (e) {
        error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      }
    }
    const t = now();
    if (outcome === 'done' && !error) {
      await prisma.outboxEvent.update({ where: { id: event.id }, data: { status: 'DONE', processedAt: t, lockedAt: null, lockedBy: null, lastError: null, attempts: { increment: 1 } } });
      result.done++;
      continue;
    }
    const attempts = event.attempts + 1;
    const dead = attempts >= event.maxAttempts;
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: dead ? 'DEAD' : 'FAILED',
        attempts,
        lastError: (error ?? 'Delivery will be retried').slice(0, 1000),
        nextAttemptAt: new Date(t.getTime() + backoffDelayMs(attempts)),
        lockedAt: null,
        lockedBy: null,
      },
    });
    if (dead) result.dead++;
    else result.retried++;
  }
  return result;
}

/** Admin action: put a dead-lettered event back in the queue. */
export async function requeueOutboxEvent(prisma: PrismaClient, id: string): Promise<boolean> {
  const updated = await prisma.outboxEvent.updateMany({
    where: { id, status: { in: ['DEAD', 'FAILED'] } },
    data: { status: 'PENDING', nextAttemptAt: new Date(), attempts: 0, lastError: null },
  });
  return updated.count === 1;
}
