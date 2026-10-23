import type { Db, Prisma } from '@harvestslot/db';

export const OUTBOX_TYPES = {
  NOTIFICATION_DELIVER: 'notification.deliver',
  PAYMENT_RECONCILE: 'payment.reconcile',
  DATA_EXPORT: 'privacy.data-export',
} as const;

export interface OutboxInput {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
  /** Same key ⇒ the event is recorded once (deduplication of retried business operations). */
  dedupeKey?: string;
  maxAttempts?: number;
  availableAt?: Date;
}

/** Writes an outbox event in the caller's transaction so it commits atomically with the business change. */
export async function enqueueOutbox(db: Db, input: OutboxInput): Promise<void> {
  const data = {
    type: input.type,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    payload: input.payload,
    dedupeKey: input.dedupeKey ?? null,
    maxAttempts: input.maxAttempts ?? 8,
    nextAttemptAt: input.availableAt ?? new Date(),
  };
  if (input.dedupeKey) {
    await db.outboxEvent.createMany({ data: [data], skipDuplicates: true });
  } else {
    await db.outboxEvent.create({ data });
  }
}

/** Exponential backoff with a ceiling: 30 s, 1 min, 2 min, … max 1 h. */
export function backoffDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
}
